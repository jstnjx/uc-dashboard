import { EventEmitter } from 'node:events';
import { createLogger, safeUrl } from './logger.js';

const log = createLogger('core-client');

const SUPPORTED_TYPES = new Set(['activity', 'media_player', 'sensor', 'select', 'button', 'light', 'climate', 'cover']);

const ENTITY_COMMAND_ALIASES = Object.freeze({
  activity: Object.freeze({
    start: 'on',
    stop: 'off',
    'activity.start': 'on',
    'activity.stop': 'off'
  })
});

function resolveEntityCommand(entity, command) {
  const requested = String(command || '').trim();
  if (!requested) return requested;
  const entityType = String(entity?.entity_type || '').toLowerCase();
  return ENTITY_COMMAND_ALIASES[entityType]?.[requested.toLowerCase()] || requested;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function coreResponseError(message, pendingMessage = 'Core request') {
  const data = message?.msg_data;
  const details = [
    data?.message,
    data?.error?.message,
    typeof data?.error === 'string' ? data.error : '',
    data?.detail,
    data?.reason,
    message?.message
  ].find((value) => typeof value === 'string' && value.trim());
  const code = Number(message?.code);
  const error = new Error(details || `${message?.msg || pendingMessage} failed${Number.isFinite(code) ? ` (${code})` : ''}`);
  error.coreCode = Number.isFinite(code) ? code : 502;
  error.statusCode = Number.isFinite(code) && code >= 400 && code < 600 ? code : 502;
  error.coreMessage = message?.msg || pendingMessage;
  return error;
}

function mediaCompatibilityError(error) {
  const code = Number(error?.coreCode || error?.statusCode);
  const text = errorMessage(error).toLowerCase();
  if (/timed out|not connected|connection closed|unavailable|asleep/.test(text)) return false;
  if (/(unknown|unexpected|invalid|unsupported|schema|deserialize|field|paging|stable|parameter|payload|request)/.test(text)) return true;
  return code >= 500 && code < 600;
}

const SUPPORTED_REMOTE_MODEL = /^(?:ucr2|ucr3(?:-[a-z0-9]+)?)$/i;
const BATTERY_STATUSES = new Set(['CHARGING', 'DISCHARGING', 'NOT_CHARGING', 'FULL']);

function validBatteryCapacity(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

function validPowerStatus(value) {
  const status = typeof value === 'string' ? value.toUpperCase() : '';
  return BATTERY_STATUSES.has(status) ? status : null;
}

export class CoreClient extends EventEmitter {
  constructor(settingsProvider) {
    super();
    this.settingsProvider = settingsProvider;
    this.ws = null;
    this.status = 'offline';
    this.message = 'Not configured';
    this.connected = false;
    this.entities = new Map();
    this.allEntities = new Map();
    this.pending = new Map();
    this.requestId = 1;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.powerTimer = null;
    this.entityRefreshTimer = null;
    this.refreshPromise = null;
    this.powerSupply = null;
    this.powerMode = null;
    this.battery = { level: null, status: null, charging: null };
    this.charger = { features: [], wirelessCharging: null, wirelessChargingEnabled: null };
    this.remote = { modelName: null, modelNumber: null, serialNumber: null, hardwareRevision: null };
    this.authSent = false;
    this.manualDisconnect = false;
  }

  runtime() {
    return {
      connectionStatus: this.status,
      connectionMessage: this.message,
      connected: this.connected,
      powerSupply: this.powerSupply,
      powerMode: this.powerMode,
      battery: { ...this.battery },
      charger: { ...this.charger },
      remote: { ...this.remote },
      entityCount: this.entities.size,
      availableEntityCount: this.allEntities.size,
      unsupportedEntityCount: Math.max(0, this.allEntities.size - this.entities.size)
    };
  }

  setStatus(status, message) {
    const changed = this.status !== status || this.message !== message || this.connected !== (status === 'connected');
    this.status = status;
    this.message = message;
    this.connected = status === 'connected';
    if (changed) {
      log.info('Runtime connection status changed', { status, message, connected: this.connected });
      this.emit('runtime', this.runtime());
    }
  }

  configure() {
    log.info('Reconfiguring Core API connection');
    this.disconnect(true);
    this.manualDisconnect = false;
    this.connect();
  }

  connect() {
    clearTimeout(this.reconnectTimer);
    const settings = this.settingsProvider();
    if (!settings.remoteWsUrl) {
      log.warn('Core WebSocket URL is not configured');
      this.setStatus('offline', 'Remote not configured');
      return;
    }

    this.manualDisconnect = false;
    this.authSent = false;
    this.setStatus('connecting', 'Connecting to Remote');
    log.info('Opening Core WebSocket', { remoteWsUrl: safeUrl(settings.remoteWsUrl), reconnectAttempt: this.reconnectAttempt });

    try {
      const ws = new WebSocket(settings.remoteWsUrl);
      this.ws = ws;

      ws.addEventListener('open', () => {
        log.info('Core WebSocket opened', { remoteWsUrl: safeUrl(settings.remoteWsUrl) });
        this.reconnectAttempt = 0;
        if (settings.apiKey) this.#sendAuth();
        else this.setStatus('error', 'Core API key required');
      });
      ws.addEventListener('message', (event) => this.#handleMessage(event.data));
      ws.addEventListener('error', (event) => {
        log.warn('Core WebSocket error', { type: event?.type || 'error', remoteWsUrl: safeUrl(settings.remoteWsUrl) });
        this.setStatus('error', 'Remote connection error');
      });
      ws.addEventListener('close', (event) => {
        log.warn('Core WebSocket closed', { code: event?.code, reason: event?.reason || '', clean: event?.wasClean, manual: this.manualDisconnect });
        if (this.ws === ws) this.ws = null;
        this.#clearPending('Remote connection closed');
        this.#stopPowerPolling();
        this.#stopEntityPolling();
        if (!this.manualDisconnect) {
          this.setStatus('offline', 'Remote unavailable or asleep');
          if (this.settingsProvider().reconnect) this.#scheduleReconnect();
        }
      });
    } catch (error) {
      log.error('Unable to create Core WebSocket', { error, remoteWsUrl: safeUrl(settings.remoteWsUrl) });
      this.setStatus('error', `Invalid Remote URL: ${errorMessage(error)}`);
    }
  }

  disconnect(manual = true) {
    log.info('Disconnecting Core client', { manual, pendingRequests: this.pending.size });
    this.manualDisconnect = manual;
    clearTimeout(this.reconnectTimer);
    this.#stopPowerPolling();
    this.#stopEntityPolling();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignored */ }
    }
    this.ws = null;
    this.#clearPending('Remote connection reset');
    if (manual) this.setStatus('offline', 'Disconnected');
  }

  async refreshEntities() {
    if (!this.connected) {
      log.debug('Skipping entity refresh while disconnected');
      return;
    }
    if (this.refreshPromise) {
      log.debug('Joining in-flight entity refresh');
      return this.refreshPromise;
    }
    log.debug('Starting entity refresh', { currentCount: this.entities.size });
    this.refreshPromise = this.#loadEntities();
    try { return await this.refreshPromise; }
    finally { this.refreshPromise = null; }
  }

  async #loadEntities() {
    if (!this.connected) return;

    // The Core API validates the requested page size at runtime. Older and
    // newer firmware releases don't all accept the same upper limit, so start
    // conservatively and automatically retry with the API minimum when needed.
    const limits = [100, 50, 20, 10];
    let acceptedLimit = null;
    let firstResponse = null;
    let lastError = null;

    for (const limit of limits) {
      try {
        log.trace('Trying entity page size', { limit });
        firstResponse = await this.request('get_entities', { paging: { limit, page: 1 } });
        acceptedLimit = limit;
        break;
      } catch (error) {
        lastError = error;
        if (!/limit/i.test(errorMessage(error))) throw error;
      }
    }

    if (!firstResponse || !acceptedLimit) throw lastError || new Error('Unable to load entities');

    const collected = [];
    let response = firstResponse;
    let page = 1;

    while (response) {
      const data = response?.msg_data || {};
      const items = Array.isArray(data.entities) ? data.entities : [];
      collected.push(...items);
      log.trace('Loaded entity page', { page, items: items.length, collected: collected.length, paging: data.paging || {} });

      const paging = data.paging || {};
      const total = Number(paging.count);
      const returnedLimit = Number(paging.limit) || acceptedLimit;
      const currentPage = Number(paging.page) || page;
      const hasKnownRemainder = Number.isFinite(total) && currentPage * returnedLimit < total;
      const hasUnknownRemainder = !Number.isFinite(total) && items.length >= returnedLimit;
      if ((!hasKnownRemainder && !hasUnknownRemainder) || items.length === 0 || page >= 1000) break;

      page = currentPage + 1;
      response = await this.request('get_entities', { paging: { limit: acceptedLimit, page } });
    }

    const all = new Map();
    const next = new Map();
    for (const entity of collected) {
      if (!entity?.entity_id) continue;
      all.set(entity.entity_id, entity);
      if (SUPPORTED_TYPES.has(entity.entity_type)) next.set(entity.entity_id, entity);
    }
    this.allEntities = all;
    this.entities = next;
    log.info('Entity refresh completed', { received: collected.length, supported: next.size, unsupported: Math.max(0, all.size - next.size), acceptedLimit });
    this.emit('entities', this.getEntities());
    this.emit('runtime', this.runtime());
  }

  getEntities() {
    return [...this.entities.values()];
  }

  getEntityCatalog() {
    return [...this.allEntities.values()].map((entity) => ({
      ...entity,
      dashboard_supported: SUPPORTED_TYPES.has(entity.entity_type),
      unsupported_reason: SUPPORTED_TYPES.has(entity.entity_type) ? '' : `Entity type ${entity.entity_type || 'unknown'} is not supported by UC Dashboard`
    }));
  }

  async executeCommand(entityId, command, params, context = {}) {
    if (!this.connected) throw new Error('Remote is not connected');
    const entity = this.entities.get(entityId);
    const requestedCommand = String(command || '').trim();
    const resolvedCommand = resolveEntityCommand(entity, requestedCommand);
    if (!resolvedCommand) {
      const error = new Error('Entity command is required');
      error.statusCode = 400;
      throw error;
    }
    const commandContext = {
      entityId,
      entityType: entity?.entity_type || null,
      requestedCommand,
      resolvedCommand,
      paramKeys: params && typeof params === 'object' ? Object.keys(params) : [],
      correlationId: context.correlationId
    };
    log.info('Executing entity command', commandContext);
    try {
      const result = await this.request('execute_entity_command', {
        entity_id: entityId,
        cmd_id: resolvedCommand,
        ...(params && Object.keys(params).length ? { params } : {})
      }, context);
      setTimeout(() => void this.refreshEntities().catch(() => {}), 350);
      setTimeout(() => void this.refreshEntities().catch(() => {}), 1800);
      log.info('Entity command accepted', commandContext);
      return result;
    } catch (error) {
      log.warn('Entity command failed', { ...commandContext, error });
      throw error;
    }
  }

  async #mediaRequest(message, requiredData, options = {}) {
    const paging = {
      limit: Math.max(10, Math.min(100, Number(options.limit) || 12)),
      page: Math.max(1, Number(options.page) || 1)
    };
    const full = { ...requiredData, paging };
    // stable_ids is optional. Omitting false is important for older Core and
    // integration versions whose strict decoders reject the optional field.
    if (options.stableIds === true) full.stable_ids = true;
    const attempts = [full];
    if (options.stableIds === true) {
      const withoutStableIds = { ...full };
      delete withoutStableIds.stable_ids;
      attempts.push(withoutStableIds);
    }
    // Some older media-browser implementations don't support paging yet.
    const withoutPaging = { ...requiredData };
    if (options.stableIds === true) withoutPaging.stable_ids = true;
    attempts.push(withoutPaging);
    if (options.stableIds === true) attempts.push({ ...requiredData });

    let lastError;
    const seen = new Set();
    for (let index = 0; index < attempts.length; index += 1) {
      const payload = attempts[index];
      const signature = JSON.stringify(payload);
      if (seen.has(signature)) continue;
      seen.add(signature);
      try {
        log.debug('Trying media request variant', { message, attempt: index + 1, entityId: requiredData.entity_id, paging: payload.paging, stableIds: payload.stable_ids === true });
        const response = await this.request(message, payload, { correlationId: options.correlationId, source: options.source || 'dashboard' });
        return response?.msg_data || {};
      } catch (error) {
        lastError = error;
        log.warn('Media request variant failed', { message, attempt: index + 1, entityId: requiredData.entity_id, error });
        if (!mediaCompatibilityError(error)) break;
      }
    }
    throw lastError || new Error(`${message} failed`);
  }

  async browseMedia(entityId, options = {}) {
    if (!this.connected) {
      const error = new Error('Remote Core is not connected');
      error.statusCode = 503;
      throw error;
    }
    const msgData = { entity_id: entityId };
    if (Object.prototype.hasOwnProperty.call(options, 'mediaId')) msgData.media_id = options.mediaId;
    if (Object.prototype.hasOwnProperty.call(options, 'mediaType')) msgData.media_type = options.mediaType;
    return this.#mediaRequest('browse_media', msgData, options);
  }

  async searchMedia(entityId, query, options = {}) {
    if (!this.connected) {
      const error = new Error('Remote Core is not connected');
      error.statusCode = 503;
      throw error;
    }
    const msgData = { entity_id: entityId, query: String(query || '') };
    if (Object.prototype.hasOwnProperty.call(options, 'mediaId')) msgData.media_id = options.mediaId;
    if (Object.prototype.hasOwnProperty.call(options, 'mediaType')) msgData.media_type = options.mediaType;
    if (Array.isArray(options.mediaClasses) && options.mediaClasses.length) msgData.filter = { media_classes: options.mediaClasses };
    return this.#mediaRequest('search_media', msgData, options);
  }

  request(msg, msgData, context = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Remote is not connected'));
    const id = this.requestId++;
    const payload = { kind: 'req', id, msg };
    if (msgData !== undefined) payload.msg_data = msgData;
    const startedAt = Date.now();
    log.debug('Remote Core API request sent', {
      direction: 'integration_to_remote_api',
      transport: 'websocket',
      requestId: id,
      message: msg,
      payload,
      correlationId: context.correlationId,
      source: context.source || 'integration',
      pendingRequests: this.pending.size
    });
    this.ws.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        log.warn('Remote Core API request timed out', { direction: 'integration_to_remote_api', transport: 'websocket', requestId: id, correlationId: context.correlationId, source: context.source || 'integration', message: msg, durationMs: Date.now() - startedAt });
        reject(new Error(`${msg} timed out`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer, msg, startedAt, correlationId: context.correlationId, source: context.source || 'integration' });
    });
  }

  #sendAuth() {
    if (this.authSent) return;
    const apiKey = this.settingsProvider().apiKey;
    if (!apiKey) {
      this.setStatus('error', 'Core API key required');
      return;
    }
    this.authSent = true;
    log.debug('Sending Core authentication request');
    this.request('auth', { token: apiKey }).catch((error) => {
      log.error('Core authentication request failed', { error });
      this.setStatus('error', `Authentication failed: ${errorMessage(error)}`);
    });
  }

  #handleMessage(raw) {
    let message;
    try {
      const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
      message = JSON.parse(text);
    } catch (error) {
      log.warn('Ignoring invalid Core WebSocket message', { error });
      return;
    }

    log.trace('Remote Core API message received', {
      direction: 'remote_api_to_integration',
      transport: 'websocket',
      kind: message.kind,
      message: message.msg,
      requestId: message.req_id,
      code: message.code,
      category: message.cat,
      payload: message
    });

    if (message.kind === 'resp' && Number.isInteger(message.req_id)) {
      const pending = this.pending.get(message.req_id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.req_id);
        const durationMs = Date.now() - (pending.startedAt || Date.now());
        if (message.code >= 200 && message.code < 300) {
          log.debug('Remote Core API response received', {
            direction: 'remote_api_to_integration',
            transport: 'websocket',
            requestId: message.req_id,
            message: pending.msg,
            correlationId: pending.correlationId,
            source: pending.source,
            code: message.code,
            durationMs,
            response: message,
            pendingRequests: this.pending.size
          });
          pending.resolve(message);
        } else {
          const error = coreResponseError(message, pending.msg);
          log.warn('Remote Core API request rejected', {
            direction: 'remote_api_to_integration',
            transport: 'websocket',
            requestId: message.req_id,
            message: pending.msg,
            correlationId: pending.correlationId,
            source: pending.source,
            code: message.code,
            durationMs,
            response: message,
            error
          });
          pending.reject(error);
        }
      }
    }

    if (message.msg === 'auth_required') {
      this.#sendAuth();
      return;
    }

    if (message.msg === 'authentication') {
      if (message.code >= 200 && message.code < 300) {
        log.info('Core authentication succeeded');
        void this.#initializeRemote();
      } else {
        log.error('Core authentication rejected', { code: message.code });
        this.setStatus('error', 'Authentication failed');
      }
      return;
    }

    if (message.msg === 'entity_change') {
      this.#mergeEntityChange(message.msg_data || {});
      return;
    }
    if (message.msg === 'battery_status') {
      this.#applyBatteryStatus(message.msg_data);
      return;
    }
    if (message.msg === 'power_mode') {
      this.#applyPowerMode(message.msg_data);
      return;
    }
    if (message.msg === 'battery_charger') this.#applyBatteryCharger(message.msg_data);
  }

  #mergeEntityChange(data) {
    if (!data.entity_id) {
      log.debug('Entity change without entity ID; scheduling full refresh', { eventType: data.event_type });
      void this.refreshEntities();
      return;
    }
    if (String(data.event_type || '').toLowerCase() === 'delete') {
      log.debug('Entity deleted', { entityId: data.entity_id });
      this.entities.delete(data.entity_id);
      this.allEntities.delete(data.entity_id);
      this.emit('entities', this.getEntities());
      return;
    }

    const previous = this.allEntities.get(data.entity_id) || this.entities.get(data.entity_id) || {
      entity_id: data.entity_id,
      entity_type: data.entity_type,
      attributes: {}
    };
    const nextState = data.new_state || {};
    const entity = {
      ...previous,
      ...nextState,
      entity_type: nextState.entity_type || data.entity_type || previous.entity_type,
      attributes: {
        ...(previous.attributes || {}),
        ...(nextState.attributes || data.attributes || {})
      }
    };
    this.allEntities.set(data.entity_id, entity);
    if (SUPPORTED_TYPES.has(entity.entity_type)) {
      log.trace('Entity state merged', { entityId: data.entity_id, entityType: entity.entity_type, eventType: data.event_type });
      this.entities.set(data.entity_id, entity);
      this.emit('entity_change', entity);
      this.emit('runtime', this.runtime());
    } else {
      this.entities.delete(data.entity_id);
      this.emit('entities', this.getEntities());
      this.emit('runtime', this.runtime());
    }
  }

  async #initializeRemote() {
    log.info('Initializing authenticated Remote session');
    try {
      const system = await this.request('system');
      this.#applySystemInfo(system?.msg_data);
      await this.request('subscribe_events', { channels: ['entities', 'battery_status'] });
      log.info('Subscribed to Core event channels', { channels: ['entities', 'battery_status'] });
      this.setStatus('connected', `Connected to ${this.remote.modelName || 'Remote'}`);
      await Promise.all([
        this.refreshEntities(),
        this.#refreshPowerData()
      ]);
      this.#startPowerPolling();
      this.#startEntityPolling();
    } catch (error) {
      if (this.manualDisconnect) {
        log.debug('Remote session initialization stopped by manual disconnect');
        return;
      }
      log.error('Remote session initialization failed', { error });
      this.setStatus('error', errorMessage(error));
      try { this.ws?.close(); } catch { /* ignored */ }
    }
  }

  #applySystemInfo(data) {
    const modelNumber = typeof data?.model_number === 'string' ? data.model_number.trim().toLowerCase() : '';
    if (!SUPPORTED_REMOTE_MODEL.test(modelNumber)) {
      throw new Error(`Unsupported device model: ${modelNumber || 'unknown'}. UC Dashboard supports Remote 2 and Remote 3 only.`);
    }
    this.remote = {
      modelName: typeof data.model_name === 'string' ? data.model_name : (modelNumber === 'ucr2' ? 'Remote Two' : 'Remote 3'),
      modelNumber,
      serialNumber: typeof data.serial_number === 'string' ? data.serial_number : null,
      hardwareRevision: typeof data.hw_revision === 'string' ? data.hw_revision : null
    };
    log.info('Remote model validated', { modelName: this.remote.modelName, modelNumber: this.remote.modelNumber, hardwareRevision: this.remote.hardwareRevision });
    this.emit('runtime', this.runtime());
  }

  async #restGet(endpoint) {
    const settings = this.settingsProvider();
    if (!settings.remoteHttpUrl || !settings.apiKey) throw new Error('Remote REST API is not configured');
    const base = new URL(settings.remoteHttpUrl);
    base.pathname = '/';
    base.search = '';
    base.hash = '';
    const url = new URL(`api/${String(endpoint).replace(/^\/+/, '')}`, base);
    const startedAt = Date.now();
    const requestId = `rest-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    log.debug('Remote Core API request sent', {
      direction: 'integration_to_remote_api',
      transport: 'rest',
      requestId,
      source: 'integration',
      method: 'GET',
      endpoint,
      url: safeUrl(url.toString())
    });
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${settings.apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });
      const text = await response.text();
      let payload = {};
      if (text) {
        try { payload = JSON.parse(text); }
        catch {
          const error = new Error(`${endpoint} returned invalid JSON`);
          error.statusCode = 502;
          throw error;
        }
      }
      log.debug('Remote Core API response received', {
        direction: 'remote_api_to_integration',
        transport: 'rest',
        requestId,
        source: 'integration',
        method: 'GET',
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
        response: payload
      });
      if (!response.ok) {
        const detail = payload?.message || payload?.error || payload?.description || response.statusText;
        const error = new Error(`${endpoint} failed (${response.status}): ${detail}`);
        error.statusCode = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      log.warn('Remote Core API request failed', {
        direction: 'integration_to_remote_api',
        transport: 'rest',
        requestId,
        source: 'integration',
        method: 'GET',
        endpoint,
        durationMs: Date.now() - startedAt,
        error
      });
      throw error;
    }
  }

  async #refreshPowerData() {
    if (!this.connected) return;
    const results = await Promise.allSettled([
      this.#restGet('/system/power'),
      this.#restGet('/system/power/battery'),
      this.#restGet('/system/power/charger')
    ]);
    const endpoints = ['/system/power', '/system/power/battery', '/system/power/charger'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') log.warn('Power REST refresh failed', { endpoint: endpoints[index], error: result.reason });
    });
    if (results[0].status === 'fulfilled') this.#applyPowerMode(results[0].value);
    if (results[1].status === 'fulfilled') this.#applyBatteryStatus(results[1].value);
    if (results[2].status === 'fulfilled') this.#applyBatteryCharger(results[2].value);
  }

  #applyPowerMode(data) {
    if (!data || typeof data !== 'object') return;
    let changed = false;
    if (typeof data.mode === 'string' && data.mode !== this.powerMode) {
      this.powerMode = data.mode;
      changed = true;
    }
    if (typeof data.power_supply === 'boolean' && data.power_supply !== this.powerSupply) {
      this.powerSupply = data.power_supply;
      this.emit('power', this.powerSupply);
      changed = true;
    }
    if (changed) {
      log.debug('Power mode updated', { mode: this.powerMode, powerSupply: this.powerSupply });
      this.emit('runtime', this.runtime());
    }
  }

  #applyBatteryStatus(data) {
    if (!data || typeof data !== 'object') return;
    const level = validBatteryCapacity(data.capacity);
    const status = validPowerStatus(data.status);
    const charging = status === 'CHARGING' || status === 'FULL';
    let changed = false;
    if (level !== null && level !== this.battery.level) { this.battery.level = level; changed = true; }
    if (status !== null && status !== this.battery.status) { this.battery.status = status; changed = true; }
    if (status !== null && charging !== this.battery.charging) { this.battery.charging = charging; changed = true; }
    if (typeof data.power_supply === 'boolean' && data.power_supply !== this.powerSupply) {
      this.powerSupply = data.power_supply;
      this.emit('power', this.powerSupply);
      changed = true;
    }
    if (changed) {
      log.debug('Battery status updated', { level: this.battery.level, status: this.battery.status, charging: this.battery.charging, powerSupply: this.powerSupply });
      this.emit('runtime', this.runtime());
    }
  }

  #applyBatteryCharger(data) {
    if (!data || typeof data !== 'object') return;
    const next = {
      features: Array.isArray(data.features) ? data.features.filter((entry) => typeof entry === 'string') : [],
      wirelessCharging: typeof data.wireless_charging === 'boolean' ? data.wireless_charging : null,
      wirelessChargingEnabled: typeof data.wireless_charging_enabled === 'boolean' ? data.wireless_charging_enabled : null
    };
    let changed = JSON.stringify(next) !== JSON.stringify(this.charger);
    this.charger = next;
    if (typeof data.power_supply === 'boolean' && data.power_supply !== this.powerSupply) {
      this.powerSupply = data.power_supply;
      this.emit('power', this.powerSupply);
      changed = true;
    }
    if (changed) {
      log.debug('Battery charger state updated', this.charger);
      this.emit('runtime', this.runtime());
    }
  }

  #startEntityPolling() {
    this.#stopEntityPolling();
    log.debug('Starting entity polling', { intervalMs: 15000 });
    this.entityRefreshTimer = setInterval(() => {
      if (!this.connected) return;
      void this.refreshEntities().catch((error) => log.warn('Periodic entity refresh failed', { error }));
    }, 15000);
  }

  #stopEntityPolling() {
    if (this.entityRefreshTimer) {
      log.debug('Stopping entity polling');
      clearInterval(this.entityRefreshTimer);
    }
    this.entityRefreshTimer = null;
  }

  #startPowerPolling() {
    this.#stopPowerPolling();
    log.debug('Starting power polling', { intervalMs: 15000 });
    this.powerTimer = setInterval(() => void this.#refreshPowerData(), 15000);
  }

  #stopPowerPolling() {
    if (this.powerTimer) {
      log.debug('Stopping power polling');
      clearInterval(this.powerTimer);
    }
    this.powerTimer = null;
  }

  #scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(30000, 1500 * (2 ** Math.min(this.reconnectAttempt, 5)));
    this.reconnectAttempt += 1;
    log.info('Scheduling Core reconnect', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  #clearPending(reason) {
    if (this.pending.size) log.warn('Rejecting pending Core requests', { reason, count: this.pending.size });
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
