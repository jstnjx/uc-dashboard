import http from 'node:http';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('dashboard-server');
const APP_VERSION = '1.12.1';
const BACKUP_FORMAT = 'uc-dashboard-backup';
const BACKUP_FORMAT_VERSION = 1;
const UNFOLDED_TOOLS_API_BASE = process.env.UNFOLDED_TOOLS_API_BASE || 'https://api.unfolded.tools';
const UNFOLDED_TOOLS_CATEGORIES = new Set(['apps', 'tv-apps', 'community', 'tv-logos']);
const ICON_CACHE_MAX_BYTES = 4 * 1024 * 1024;
const ICON_METADATA_TTL_MS = 6 * 60 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
};

const DEFAULT_CONFIG = {
  version: 37,
  activeDashboardId: 'main',
  widgetDefaults: {},
  widgetPresets: [],
  widgetMasters: [],
  backgroundPresets: [],
  iconAssets: {},
  ui: { localization: { enabled: false, language: 'en', customDictionaries: {} }, entities: { mode: 'all', includedIds: [] }, notifications: { autoLowBattery: true, batteryThreshold: 20, autoUnavailable: true, autoUpdates: true, acknowledgeMinutes: 60, dismissHours: 24, maxStatusAlerts: 100 }, screensaver: { enabled: false, timeoutSeconds: 300, mode: 'clock', title: '', image: '', background: '#000000', foreground: '#ffffff', overlay: 25, showDate: true, showBattery: true, showConnection: false, movement: true, movementDuration: 180, contentScale: 100, clockSize: 100, showWakeHint: true, imageFit: 'cover', lockEnabled: false, lockPinHash: '', lockPinHint: '', triggers: [] }, kiosk: { scaleToFit: false, allowUpscale: false, padding: 0, widthMode: 'fill' }, navigation: { mode: 'default', showIcons: true, showLabels: true, cardWidth: 152, transition: 'slide' }, statusBar: { visible: true, layoutColumns: 7, layoutItems: [{ id: 'status-time', type: 'time' }, { id: 'status-page', type: 'page' }, { id: 'status-connection', type: 'connection_dot' }, { id: 'status-charging', type: 'charging_indicator' }, { id: 'status-wifi', type: 'wifi' }, { id: 'status-alerts', type: 'alerts' }, { id: 'status-profile', type: 'profile' }], showSeconds: false, hour12: false, profileText: 'W', alignment: 'distributed', background: '#000000', backgroundOpacity: 98, foreground: '#d0d0d0', height: 40, sticky: true, blur: 0, borderWidth: 0, borderColor: '#252525', radius: 0, shadow: false } },
  dashboards: [{ id: 'main', name: 'Living Room', navIcon: 'living', navColor: '#d0d0d0', background: { preset: 'black', color: '#000000', image: '', overlay: 0, fit: 'cover', position: 'center center', fixed: true }, items: [] }]
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin'
  });
  res.end(body);
}

function sendJsonDownload(res, payload, filename) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const safeFilename = String(filename || 'uc-dashboard-backup.json').replace(/[^a-z0-9._-]+/gi, '-');
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'content-disposition': `attachment; filename="${safeFilename}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin'
  });
  res.end(body);
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, '');
}

function backupFilename(date = new Date()) {
  return `uc-dashboard-backup-${backupTimestamp(date)}.json`;
}

function countDashboardWidgets(config) {
  let count = 0;
  const visit = (items) => {
    for (const item of items || []) {
      count += 1;
      if (item?.kind === 'system' && item.widgetType === 'tab_container') {
        for (const tab of item.settings?.tabs || []) visit(tab.items);
      } else if (item?.kind === 'system' && ['conditional', 'carousel', 'entity_group'].includes(item.widgetType)) visit(item.settings?.items);
    }
  };
  for (const dashboard of config?.dashboards || []) visit(dashboard.items);
  return count;
}

function createBackupPayload(config, settings, exportedAt = new Date(), iconAssets = []) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    application: { id: 'uc_dashboard', name: 'UC Dashboard', version: APP_VERSION },
    exportedAt: exportedAt.toISOString(),
    dashboardConfig: config,
    settings,
    iconAssets,
    summary: {
      dashboards: Array.isArray(config?.dashboards) ? config.dashboards.length : 0,
      widgets: countDashboardWidgets(config),
      schemaVersion: Number(config?.version) || 0
    }
  };
}

function extractBackupPayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!source) throw new Error('Backup must be a JSON object');
  if (source.format === BACKUP_FORMAT) {
    if (Number(source.formatVersion) !== BACKUP_FORMAT_VERSION) throw new Error(`Unsupported backup format version: ${source.formatVersion}`);
    return { dashboardConfig: source.dashboardConfig, settings: source.settings, iconAssets: Array.isArray(source.iconAssets) ? source.iconAssets : [], metadata: source };
  }
  if (validateDashboardConfig(source)) return { dashboardConfig: source, settings: null, iconAssets: [], metadata: { legacy: true } };
  throw new Error('This file is not a valid UC Dashboard backup');
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

function validateDashboardConfig(config) {
  return Boolean(config && typeof config === 'object' && Array.isArray(config.dashboards) && config.dashboards.length > 0 && config.dashboards.every((dashboard) =>
    dashboard && typeof dashboard.id === 'string' && typeof dashboard.name === 'string' && Array.isArray(dashboard.items)));
}

function normalizeUnfoldedToolsCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  if (!UNFOLDED_TOOLS_CATEGORIES.has(category)) throw Object.assign(new Error('Unsupported unfolded.tools icon category'), { statusCode: 400 });
  return category;
}

function normalizeUnfoldedToolsCountry(value) {
  const country = String(value || '').trim().toLowerCase();
  if (!country || !/^[a-z0-9-]{2,80}$/.test(country)) throw Object.assign(new Error('A valid TV-logo country is required'), { statusCode: 400 });
  return country;
}

function safeIconCacheFilename(category, country, id) {
  const digest = createHash('sha256').update(`${category}:${country || ''}:${id}`).digest('hex').slice(0, 32);
  return `${category.replace(/[^a-z0-9-]/g, '-')}-${digest}.webp`;
}

function cachedIconUrl(filename) {
  return `/api/unfolded-tools/cached/${encodeURIComponent(filename)}`;
}

function unfoldedToolsApiError(status, payload = {}) {
  const message = payload?.message || payload?.error || `unfolded.tools request failed (${status})`;
  const error = new Error(message);
  error.statusCode = status === 401 || status === 403 ? 401 : status === 404 ? 404 : status >= 500 ? 502 : 400;
  return error;
}

function iconMimeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function requestQuery(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function dashboardRequestPayload(pathname, body) {
  if (!body || typeof body !== 'object') return body;
  if (pathname === '/api/config') {
    return {
      version: body.version,
      activeDashboardId: body.activeDashboardId,
      dashboards: Array.isArray(body.dashboards) ? body.dashboards.length : 0,
      widgetPresets: Array.isArray(body.widgetPresets) ? body.widgetPresets.length : 0,
      widgetMasters: Array.isArray(body.widgetMasters) ? body.widgetMasters.length : 0
    };
  }
  if (pathname === '/api/settings' || pathname === '/api/unfolded-tools/test') {
    return {
      ...body,
      ...(Object.prototype.hasOwnProperty.call(body, 'unfoldedToolsApiKey') ? { unfoldedToolsApiKey: '[redacted]' } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'apiKey') ? { apiKey: '[redacted]' } : {})
    };
  }
  return body;
}

export class DashboardServer {
  constructor({ publicDir, dataDir, settingsManager, coreClient, runtimeProvider, onSettingsChanged }) {
    this.publicDir = publicDir;
    this.dataDir = dataDir;
    this.settingsManager = settingsManager;
    this.coreClient = coreClient;
    this.runtimeProvider = runtimeProvider;
    this.onSettingsChanged = onSettingsChanged;
    this.configFile = path.join(dataDir, 'dashboard.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.iconCacheDir = path.join(dataDir, 'icons', 'unfolded-tools');
    this.server = null;
    this.listening = false;
    this.sseClients = new Set();
    this.keepAliveTimer = null;
    this.configRevision = Date.now();
    this.mediaInflight = new Map();
    this.mediaCache = new Map();
    this.unfoldedToolsMetadataCache = new Map();

    coreClient.on('runtime', () => this.broadcast('runtime', this.runtimeProvider()));
    coreClient.on('entities', () => { this.broadcast('entities', this.entities()); this.broadcast('entity_catalog', this.entityCatalog()); });
    coreClient.on('entity_change', (entity) => this.broadcast('entity_change', entity));
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.iconCacheDir, { recursive: true });
    if (!existsSync(this.configFile)) {
      await writeJsonAtomic(this.configFile, DEFAULT_CONFIG);
      log.info('Created default dashboard configuration', { configFile: this.configFile, schemaVersion: DEFAULT_CONFIG.version });
    } else {
      try {
        const config = JSON.parse(await readFile(this.configFile, 'utf8'));
        log.info('Loaded dashboard configuration', { configFile: this.configFile, schemaVersion: config.version, dashboards: config.dashboards?.length || 0 });
      } catch (error) {
        log.error('Dashboard configuration could not be parsed', { configFile: this.configFile, error });
        throw error;
      }
    }
  }

  entities() {
    return this.coreClient.getEntities();
  }

  entityCatalog() {
    return this.coreClient.getEntityCatalog();
  }

  async start() {
    if (this.listening) {
      log.debug('Dashboard listener is already running');
      return;
    }
    const settings = this.settingsManager.get();
    this.server = http.createServer((req, res) => void this.#handle(req, res));
    this.server.on('clientError', (error, socket) => {
      log.warn('Dashboard HTTP client error', { error, remoteAddress: socket.remoteAddress });
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(settings.dashboardPort, settings.dashboardHost, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.listening = true;
    this.keepAliveTimer = setInterval(() => {
      for (const client of this.sseClients) client.write(': keepalive\n\n');
    }, 20000);
    log.info('Dashboard HTTP server listening', { host: settings.dashboardHost, port: settings.dashboardPort, publicDir: this.publicDir, dataDir: this.dataDir });
  }

  async stop(reason = 'Dashboard paused') {
    if (!this.listening || !this.server) {
      log.debug('Dashboard listener is already stopped', { reason });
      return;
    }
    log.info('Stopping dashboard HTTP server', { reason, sseClients: this.sseClients.size });
    for (const client of this.sseClients) {
      client.write(`event: runtime\ndata: ${JSON.stringify({ ...this.runtimeProvider(), dashboardListening: false, connectionMessage: reason })}\n\n`);
      client.end();
    }
    this.sseClients.clear();
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
    this.listening = false;
    log.info('Dashboard HTTP server stopped', { reason });
  }

  broadcast(eventName, data) {
    log.trace('Broadcasting dashboard event', { eventName, clients: this.sseClients.size });
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) client.write(payload);
  }

  async #runMediaRequest(key, task) {
    const cached = this.mediaCache.get(key);
    if (cached && Date.now() - cached.savedAt < 5000) {
      log.debug('Serving media result from cache', { key });
      return structuredClone(cached.value);
    }
    if (this.mediaInflight.has(key)) {
      log.debug('Joining in-flight media request', { key });
      return this.mediaInflight.get(key);
    }
    log.debug('Starting media request', { key });
    const promise = Promise.resolve().then(task).then((value) => {
      this.mediaCache.set(key, { value: structuredClone(value), savedAt: Date.now() });
      if (this.mediaCache.size > 100) this.mediaCache.delete(this.mediaCache.keys().next().value);
      return value;
    }).finally(() => this.mediaInflight.delete(key));
    this.mediaInflight.set(key, promise);
    return promise;
  }

  #sendMediaError(res, error, operation, entityId) {
    const rawCode = Number(error?.statusCode || error?.coreCode);
    let statusCode = Number.isFinite(rawCode) && rawCode >= 400 && rawCode < 600 ? rawCode : 502;
    if (statusCode === 500) statusCode = 502;
    if (/timed out/i.test(String(error?.message || ''))) statusCode = 504;
    if (/not connected|unavailable|asleep|connection closed/i.test(String(error?.message || ''))) statusCode = 503;
    const message = error instanceof Error ? error.message : String(error || 'Unknown media error');
    log.error('Media request failed', { operation, entityId, statusCode, error });
    sendJson(res, statusCode, {
      error: message || `Media ${operation} failed`,
      operation,
      entityId,
      ...(Number.isFinite(Number(error?.coreCode)) ? { coreCode: Number(error.coreCode) } : {})
    });
  }

  async #handle(req, res) {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);
    let pathname = '';
    res.on('finish', () => {
      log.debug('Dashboard response sent', {
        direction: 'integration_to_dashboard',
        requestId,
        method: req.method,
        pathname,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress: req.socket.remoteAddress
      });
    });
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = requestUrl.pathname;
      const query = requestQuery(requestUrl);
      const apiRequest = pathname.startsWith('/api/');
      const requestMetadata = {
        direction: 'dashboard_to_integration',
        requestId,
        method: req.method,
        pathname,
        query,
        remoteAddress: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || '',
        contentType: req.headers['content-type'] || '',
        contentLength: Number(req.headers['content-length']) || undefined
      };
      if (apiRequest) log.debug('Dashboard API request received', requestMetadata);
      else log.trace('Dashboard HTTP request received', requestMetadata);

      if (pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, ...this.runtimeProvider() });
        return;
      }
      if (pathname === '/api/runtime' && req.method === 'GET') {
        sendJson(res, 200, this.runtimeProvider());
        return;
      }
      if (pathname === '/api/entities' && req.method === 'GET') {
        sendJson(res, 200, { entities: this.entities(), catalog: this.entityCatalog() });
        return;
      }
      if (pathname === '/api/entities/refresh' && req.method === 'POST') {
        if (!this.coreClient.connected) {
          sendJson(res, 409, { error: 'Remote Core is not connected' });
          return;
        }
        log.info('Manual entity refresh requested', { requestId });
        await this.coreClient.refreshEntities();
        const entities = this.entities();
        sendJson(res, 200, { ok: true, count: entities.length, entities, catalog: this.entityCatalog() });
        return;
      }
      if (pathname === '/api/media/browse' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, body) });
        if (!body.entityId) {
          sendJson(res, 400, { error: 'entityId is required' });
          return;
        }
        const entityId = String(body.entityId);
        const limit = Math.max(10, Math.min(100, Number(body.limit) || 12));
        const page = Math.max(1, Number(body.page) || 1);
        if (!this.coreClient.connected) {
          sendJson(res, 503, { error: 'Remote Core is not connected', operation: 'browse', entityId });
          return;
        }
        try {
          const requestOptions = {
            ...(Object.prototype.hasOwnProperty.call(body, 'mediaId') ? { mediaId: body.mediaId } : {}),
            ...(Object.prototype.hasOwnProperty.call(body, 'mediaType') ? { mediaType: body.mediaType } : {}),
            page,
            limit,
            stableIds: body.stableIds === true
          };
          const key = `browse:${JSON.stringify([entityId, requestOptions])}`;
          const result = await this.#runMediaRequest(key, () => this.coreClient.browseMedia(entityId, { ...requestOptions, correlationId: requestId, source: 'dashboard' }));
          sendJson(res, 200, result);
        } catch (error) {
          this.#sendMediaError(res, error, 'browse', entityId);
        }
        return;
      }
      if (pathname === '/api/media/search' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, body) });
        if (!body.entityId || !String(body.query || '').trim()) {
          sendJson(res, 400, { error: 'entityId and query are required' });
          return;
        }
        const entityId = String(body.entityId);
        const query = String(body.query).trim();
        const limit = Math.max(10, Math.min(100, Number(body.limit) || 12));
        const page = Math.max(1, Number(body.page) || 1);
        if (!this.coreClient.connected) {
          sendJson(res, 503, { error: 'Remote Core is not connected', operation: 'search', entityId });
          return;
        }
        try {
          const requestOptions = {
            ...(Object.prototype.hasOwnProperty.call(body, 'mediaId') ? { mediaId: body.mediaId } : {}),
            ...(Object.prototype.hasOwnProperty.call(body, 'mediaType') ? { mediaType: body.mediaType } : {}),
            page,
            limit,
            stableIds: body.stableIds === true,
            mediaClasses: Array.isArray(body.mediaClasses) ? body.mediaClasses : undefined
          };
          const key = `search:${JSON.stringify([entityId, query, requestOptions])}`;
          const result = await this.#runMediaRequest(key, () => this.coreClient.searchMedia(entityId, query, { ...requestOptions, correlationId: requestId, source: 'dashboard' }));
          sendJson(res, 200, result);
        } catch (error) {
          this.#sendMediaError(res, error, 'search', entityId);
        }
        return;
      }
      if (pathname === '/api/media-image' && req.method === 'GET') {
        await this.#proxyMediaImage(requestUrl, res);
        return;
      }
      if (pathname === '/api/camera-image' && req.method === 'GET') {
        await this.#proxyCameraImage(requestUrl, res);
        return;
      }
      if (pathname === '/api/camera-stream' && req.method === 'GET') {
        await this.#proxyCameraStream(requestUrl, req, res);
        return;
      }
      if (pathname === '/api/unfolded-tools/status' && req.method === 'GET') {
        const cache = await this.#unfoldedToolsCacheStats();
        sendJson(res, 200, {
          configured: Boolean(this.settingsManager.get().unfoldedToolsApiKey),
          cacheSelected: this.settingsManager.get().unfoldedToolsCacheSelected !== false,
          includeInBackup: this.settingsManager.get().unfoldedToolsIncludeInBackup !== false,
          cache
        });
        return;
      }
      if (pathname === '/api/unfolded-tools/test' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 64 * 1024));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, body) });
        const apiKey = String(body?.apiKey || this.settingsManager.get().unfoldedToolsApiKey || '').trim();
        const result = await this.#unfoldedToolsFetchJson('/v1/icons/apps/count', apiKey);
        sendJson(res, 200, { ok: true, total: Number(result?.total) || 0, category: result?.category || 'apps' });
        return;
      }
      if (pathname === '/api/unfolded-tools/countries' && req.method === 'GET') {
        const payload = await this.#unfoldedToolsFetchJson('/v1/icons/tv-logos/countries');
        const countries = Array.isArray(payload?.countries) ? payload.countries.map((entry) => ({
          country: String(entry?.country || ''),
          iconCount: Number(entry?.icon_count) || 0
        })).filter((entry) => entry.country) : [];
        sendJson(res, 200, { countries, total: Number(payload?.total_countries) || countries.length, totalIcons: Number(payload?.total_icons) || 0 });
        return;
      }
      if (pathname === '/api/unfolded-tools/icons' && req.method === 'GET') {
        const category = normalizeUnfoldedToolsCategory(requestUrl.searchParams.get('category'));
        const country = category === 'tv-logos' ? normalizeUnfoldedToolsCountry(requestUrl.searchParams.get('country')) : '';
        const query = String(requestUrl.searchParams.get('query') || '').trim().toLocaleLowerCase();
        const page = Math.max(1, Number.parseInt(requestUrl.searchParams.get('page') || '1', 10) || 1);
        const limit = Math.max(12, Math.min(120, Number.parseInt(requestUrl.searchParams.get('limit') || '48', 10) || 48));
        const metadata = await this.#unfoldedToolsMetadata(category, country);
        const filtered = query ? metadata.icons.filter((entry) => entry.name.toLocaleLowerCase().includes(query) || entry.id.toLocaleLowerCase().includes(query)) : metadata.icons;
        const pages = Math.max(1, Math.ceil(filtered.length / limit));
        const resolvedPage = Math.min(page, pages);
        const start = (resolvedPage - 1) * limit;
        sendJson(res, 200, {
          category,
          country,
          total: filtered.length,
          page: resolvedPage,
          pages,
          refreshedAt: metadata.refreshedAt,
          icons: filtered.slice(start, start + limit)
        });
        return;
      }
      if (pathname === '/api/unfolded-tools/cache' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 128 * 1024));
        const result = await this.#cacheUnfoldedToolsIcon(body);
        sendJson(res, 200, result);
        return;
      }
      if (pathname === '/api/unfolded-tools/cache' && req.method === 'DELETE') {
        await rm(this.iconCacheDir, { recursive: true, force: true });
        await mkdir(this.iconCacheDir, { recursive: true });
        sendJson(res, 200, { ok: true, cache: await this.#unfoldedToolsCacheStats() });
        return;
      }
      if (pathname.startsWith('/api/unfolded-tools/cached/') && ['GET', 'HEAD'].includes(req.method)) {
        await this.#serveCachedUnfoldedToolsIcon(pathname.slice('/api/unfolded-tools/cached/'.length), res, req.method === 'HEAD');
        return;
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no'
        });
        log.info('Dashboard SSE client connected', { requestId, remoteAddress: req.socket.remoteAddress, clients: this.sseClients.size + 1 });
        res.write(`event: snapshot\ndata: ${JSON.stringify({ runtime: this.runtimeProvider(), entities: this.entities(), catalog: this.entityCatalog(), configRevision: this.configRevision })}\n\n`);
        this.sseClients.add(res);
        req.on('close', () => {
          this.sseClients.delete(res);
          log.info('Dashboard SSE client disconnected', { requestId, clients: this.sseClients.size });
        });
        return;
      }
      if (pathname === '/api/backup' && req.method === 'GET') {
        const config = JSON.parse(await readFile(this.configFile, 'utf8'));
        const exportedAt = new Date();
        const iconAssets = await this.#collectBackupIconAssets(config);
        const backup = createBackupPayload(config, this.settingsManager.backupForExport(), exportedAt, iconAssets);
        log.info('Dashboard backup exported', { requestId, dashboards: backup.summary.dashboards, widgets: backup.summary.widgets, schemaVersion: backup.summary.schemaVersion });
        sendJsonDownload(res, backup, backupFilename(exportedAt));
        return;
      }
      if (pathname === '/api/backup/import' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 64 * 1024 * 1024));
        const candidate = Object.prototype.hasOwnProperty.call(body || {}, 'backup') ? body.backup : body;
        const restoreSettings = body?.restoreSettings === true;
        const imported = extractBackupPayload(candidate);
        if (!validateDashboardConfig(imported.dashboardConfig)) {
          sendJson(res, 400, { error: 'Backup contains an invalid dashboard configuration' });
          return;
        }
        if (restoreSettings && imported.settings) this.settingsManager.validateBackupSettings(imported.settings);

        const currentConfig = JSON.parse(await readFile(this.configFile, 'utf8'));
        const safetyCreatedAt = new Date();
        const safetyIconAssets = await this.#collectBackupIconAssets(currentConfig, true);
        const safetyBackup = createBackupPayload(currentConfig, this.settingsManager.backupForExport(), safetyCreatedAt, safetyIconAssets);
        await mkdir(this.backupDir, { recursive: true });
        const safetyFilename = `pre-import-${backupTimestamp(safetyCreatedAt)}.json`;
        await writeJsonAtomic(path.join(this.backupDir, safetyFilename), safetyBackup);

        const restoredIcons = await this.#restoreBackupIconAssets(imported.iconAssets);
        await writeJsonAtomic(this.configFile, imported.dashboardConfig);
        let settingsResult = { connectionChanged: false, listenerChanged: false, entitiesChanged: false };
        if (restoreSettings && imported.settings) settingsResult = await this.settingsManager.update(imported.settings);
        this.configRevision = Date.now();
        const summary = {
          dashboards: imported.dashboardConfig.dashboards.length,
          widgets: countDashboardWidgets(imported.dashboardConfig),
          schemaVersion: Number(imported.dashboardConfig.version) || 0,
          restoredIcons
        };
        log.info('Dashboard backup imported', { requestId, ...summary, restoredSettings: restoreSettings && Boolean(imported.settings), safetyFilename });
        sendJson(res, 200, {
          ok: true,
          revision: this.configRevision,
          summary,
          restoredSettings: restoreSettings && Boolean(imported.settings),
          settings: this.settingsManager.forUi(),
          safetyBackup: safetyFilename
        });
        this.broadcast('config_changed', { revision: this.configRevision, reason: 'backup_import' });
        if (settingsResult.connectionChanged || settingsResult.listenerChanged || settingsResult.entitiesChanged) setImmediate(() => this.onSettingsChanged(settingsResult));
        return;
      }

      if (pathname === '/api/config' && req.method === 'GET') {
        sendJson(res, 200, JSON.parse(await readFile(this.configFile, 'utf8')));
        return;
      }
      if (pathname === '/api/config' && req.method === 'PUT') {
        const config = JSON.parse(await readBody(req, 12 * 1024 * 1024));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, config) });
        if (!validateDashboardConfig(config)) {
          sendJson(res, 400, { error: 'Invalid dashboard configuration' });
          return;
        }
        await writeJsonAtomic(this.configFile, config);
        log.info('Dashboard configuration saved', { requestId, schemaVersion: config.version, dashboards: config.dashboards.length, activeDashboardId: config.activeDashboardId });
        const publish = ['1', 'true', 'yes'].includes(String(requestUrl.searchParams.get('publish') || '').toLowerCase());
        const userSave = publish && req.headers['x-uc-wall-user-save'] === '1' && ['1', 'true', 'yes'].includes(String(requestUrl.searchParams.get('user_save') || '').toLowerCase());
        if (publish) this.configRevision = Date.now();
        sendJson(res, 200, { ok: true, revision: this.configRevision, published: publish, clientsNotified: userSave });
        if (userSave) this.broadcast('config_changed', { revision: this.configRevision, reason: 'user_save' });
        return;
      }
      if (pathname === '/api/settings' && req.method === 'GET') {
        sendJson(res, 200, this.settingsManager.forUi());
        return;
      }
      if (pathname === '/api/settings' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, body) });
        log.info('Dashboard settings update requested', { requestId, fields: Object.keys(body || {}) });
        const previousUnfoldedToolsKey = String(this.settingsManager.get().unfoldedToolsApiKey || '');
        const result = await this.settingsManager.update(body);
        if (previousUnfoldedToolsKey !== String(this.settingsManager.get().unfoldedToolsApiKey || '')) this.unfoldedToolsMetadataCache.clear();
        sendJson(res, 200, { ok: true, settings: this.settingsManager.forUi() });
        setImmediate(() => this.onSettingsChanged(result));
        return;
      }
      if (pathname === '/api/reconnect' && req.method === 'POST') {
        log.info('Manual Core reconnect requested', { requestId });
        this.coreClient.configure();
        sendJson(res, 202, { ok: true });
        return;
      }
      if (pathname === '/api/command' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        log.debug('Dashboard API request payload', { direction: 'dashboard_to_integration', requestId, pathname, payload: dashboardRequestPayload(pathname, body) });
        if (!body.entityId || !body.command) {
          sendJson(res, 400, { error: 'entityId and command are required' });
          return;
        }
        log.info('Dashboard entity command requested', { requestId, entityId: body.entityId, command: body.command, paramKeys: body.params && typeof body.params === 'object' ? Object.keys(body.params) : [] });
        await this.coreClient.executeCommand(body.entityId, body.command, body.params, { correlationId: requestId, source: 'dashboard' });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      await this.#serveStatic(pathname, res, req.method === 'HEAD');
    } catch (error) {
      const statusCode = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      sendJson(res, statusCode, { error: statusCode === 500 ? 'Internal server error' : error.message });
      if (statusCode >= 500) log.error('Dashboard HTTP request failed', { requestId, method: req.method, pathname, statusCode, error });
      else log.warn('Dashboard HTTP request rejected', { requestId, method: req.method, pathname, statusCode, error });
    }
  }


  async #unfoldedToolsFetchJson(endpoint, apiKey = '') {
    const key = String(apiKey || this.settingsManager.get().unfoldedToolsApiKey || '').trim();
    if (!key) throw Object.assign(new Error('Configure an unfolded.tools API key in Settings → Icons'), { statusCode: 401 });
    const target = new URL(endpoint, UNFOLDED_TOOLS_API_BASE);
    let response;
    try {
      response = await fetch(target, {
        headers: { 'x-api-key': key, accept: 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      throw Object.assign(new Error(`Unable to reach api.unfolded.tools: ${error.message}`), { statusCode: 502 });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw unfoldedToolsApiError(response.status, payload);
    return payload;
  }

  async #unfoldedToolsMetadata(categoryValue, countryValue = '') {
    const category = normalizeUnfoldedToolsCategory(categoryValue);
    const country = category === 'tv-logos' ? normalizeUnfoldedToolsCountry(countryValue) : '';
    const cacheKey = `${category}:${country}`;
    const cached = this.unfoldedToolsMetadataCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < ICON_METADATA_TTL_MS) return cached;
    const endpoint = category === 'tv-logos'
      ? `/v1/icons/tv-logos/${encodeURIComponent(country)}?fields=id,name,url,category`
      : `/v1/icons/${encodeURIComponent(category)}?fields=id,name,url,category`;
    const payload = await this.#unfoldedToolsFetchJson(endpoint);
    const icons = Array.isArray(payload?.icons) ? payload.icons.map((entry) => ({
      id: String(entry?.id || ''),
      name: String(entry?.name || entry?.id || 'Icon'),
      category,
      country,
      thumbnailUrl: String(entry?.url || '')
    })).filter((entry) => entry.id && entry.thumbnailUrl) : [];
    icons.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    const metadata = { icons, refreshedAt: payload?.refreshedAt || '', loadedAt: Date.now() };
    this.unfoldedToolsMetadataCache.set(cacheKey, metadata);
    return metadata;
  }

  async #cacheUnfoldedToolsIcon(body = {}) {
    const category = normalizeUnfoldedToolsCategory(body.category);
    const country = category === 'tv-logos' ? normalizeUnfoldedToolsCountry(body.country) : '';
    const id = String(body.id || '').trim();
    if (!id || id.length > 300) throw Object.assign(new Error('A valid icon ID is required'), { statusCode: 400 });
    const metadata = await this.#unfoldedToolsMetadata(category, country);
    const listed = metadata.icons.find((entry) => entry.id === id);
    if (!listed) throw Object.assign(new Error('The selected unfolded.tools icon is no longer available'), { statusCode: 404 });
    const name = listed.name;
    const baseAsset = {
      provider: 'unfolded_tools',
      category,
      country,
      id,
      name,
      sourceUrl: listed.thumbnailUrl,
      cachedAt: new Date().toISOString()
    };
    if (this.settingsManager.get().unfoldedToolsCacheSelected === false) {
      return { ok: true, cached: false, url: listed.thumbnailUrl, asset: { ...baseAsset, localPath: '' } };
    }

    const endpoint = category === 'tv-logos'
      ? `/v1/icons/tv-logos/${encodeURIComponent(country)}/${encodeURIComponent(name)}`
      : `/v1/icons/${encodeURIComponent(category)}/${encodeURIComponent(id)}`;
    const payload = await this.#unfoldedToolsFetchJson(endpoint);
    const icon = payload?.icon || payload;
    let image;
    if (typeof icon?.base64 === 'string' && icon.base64.trim()) {
      image = Buffer.from(icon.base64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64');
    } else if (icon?.url || listed.thumbnailUrl) {
      const imageUrl = new URL(icon?.url || listed.thumbnailUrl);
      if (imageUrl.protocol !== 'https:' || !['unfolded.tools', 'www.unfolded.tools'].includes(imageUrl.hostname)) {
        throw Object.assign(new Error('The selected icon returned an unsupported image URL'), { statusCode: 502 });
      }
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (!response.ok) throw Object.assign(new Error(`Unable to download selected icon (${response.status})`), { statusCode: 502 });
      image = Buffer.from(await response.arrayBuffer());
    }
    if (!image?.length) throw Object.assign(new Error('The selected icon did not contain image data'), { statusCode: 502 });
    if (image.length > ICON_CACHE_MAX_BYTES) throw Object.assign(new Error('The selected icon is too large to cache'), { statusCode: 413 });
    const filename = safeIconCacheFilename(category, country, id);
    await mkdir(this.iconCacheDir, { recursive: true });
    await writeFile(path.join(this.iconCacheDir, filename), image);
    const localPath = cachedIconUrl(filename);
    const asset = { ...baseAsset, fileName: filename, mimeType: 'image/webp', localPath, bytes: image.length };
    return { ok: true, cached: true, url: localPath, asset };
  }

  async #serveCachedUnfoldedToolsIcon(rawFilename, res, headOnly = false) {
    const filename = path.basename(decodeURIComponent(String(rawFilename || '')));
    if (!/^[a-z0-9-]{1,80}\.(?:webp|png|svg)$/i.test(filename)) {
      sendJson(res, 404, { error: 'Cached icon not found' });
      return;
    }
    const file = path.join(this.iconCacheDir, filename);
    let info;
    try { info = await stat(file); } catch { sendJson(res, 404, { error: 'Cached icon not found' }); return; }
    if (!info.isFile()) { sendJson(res, 404, { error: 'Cached icon not found' }); return; }
    res.writeHead(200, {
      'content-type': iconMimeFromFilename(filename),
      'content-length': info.size,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    if (headOnly) res.end();
    else createReadStream(file).pipe(res);
  }

  async #unfoldedToolsCacheStats() {
    let entries = [];
    try { entries = await readdir(this.iconCacheDir, { withFileTypes: true }); } catch { return { icons: 0, bytes: 0 }; }
    let icons = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(?:webp|png|svg)$/i.test(entry.name)) continue;
      icons += 1;
      try { bytes += (await stat(path.join(this.iconCacheDir, entry.name))).size; } catch {}
    }
    return { icons, bytes };
  }

  async #collectBackupIconAssets(config, forceInclude = false) {
    if (!forceInclude && this.settingsManager.get().unfoldedToolsIncludeInBackup === false) return [];
    const assets = config?.iconAssets && typeof config.iconAssets === 'object' ? Object.values(config.iconAssets) : [];
    const result = [];
    let totalBytes = 0;
    for (const metadata of assets) {
      if (metadata?.provider !== 'unfolded_tools' || !metadata?.fileName) continue;
      const filename = path.basename(String(metadata.fileName));
      if (!/^[a-z0-9-]{1,80}\.(?:webp|png|svg)$/i.test(filename)) continue;
      let data;
      try { data = await readFile(path.join(this.iconCacheDir, filename)); } catch { continue; }
      if (!data.length || data.length > ICON_CACHE_MAX_BYTES || totalBytes + data.length > 28 * 1024 * 1024) continue;
      totalBytes += data.length;
      result.push({
        fileName: filename,
        mimeType: String(metadata.mimeType || iconMimeFromFilename(filename)),
        data: data.toString('base64'),
        metadata: { ...metadata, fileName: filename, localPath: cachedIconUrl(filename) }
      });
    }
    return result;
  }

  async #restoreBackupIconAssets(iconAssets = []) {
    if (!Array.isArray(iconAssets) || !iconAssets.length) return 0;
    await mkdir(this.iconCacheDir, { recursive: true });
    let restored = 0;
    for (const entry of iconAssets.slice(0, 500)) {
      const filename = path.basename(String(entry?.fileName || ''));
      if (!/^[a-z0-9-]{1,80}\.(?:webp|png|svg)$/i.test(filename) || typeof entry?.data !== 'string') continue;
      const data = Buffer.from(entry.data, 'base64');
      if (!data.length || data.length > ICON_CACHE_MAX_BYTES) continue;
      await writeFile(path.join(this.iconCacheDir, filename), data);
      restored += 1;
    }
    return restored;
  }


  async #findWidget(widgetId) {
    const config = JSON.parse(await readFile(this.configFile, 'utf8'));
    const visit = (items) => {
      for (const item of items || []) {
        if (item.id === widgetId) return item;
        if (item.kind === 'system' && ['conditional', 'carousel', 'entity_group'].includes(item.widgetType)) {
          const found = visit(item.settings?.items);
          if (found) return found;
        }
        if (item.kind === 'system' && item.widgetType === 'tab_container') {
          for (const tab of item.settings?.tabs || []) {
            const found = visit(tab.items);
            if (found) return found;
          }
        }
      }
      return null;
    };
    for (const dashboard of config.dashboards || []) {
      const found = visit(dashboard.items);
      if (found) return found;
    }
    return null;
  }

  async #cameraSettings(requestUrl, res) {
    const widgetId = requestUrl.searchParams.get('widget');
    if (!widgetId) {
      sendJson(res, 400, { error: 'Missing camera widget identifier' });
      return null;
    }
    const item = await this.#findWidget(widgetId);
    if (!item || item.kind !== 'system' || item.widgetType !== 'camera') {
      sendJson(res, 404, { error: 'Camera widget not found' });
      return null;
    }
    const sourceUrl = String(item.settings?.sourceUrl || '').trim();
    if (!sourceUrl) {
      sendJson(res, 400, { error: 'Camera URL is not configured' });
      return null;
    }
    let target;
    try { target = new URL(sourceUrl); }
    catch {
      sendJson(res, 400, { error: 'Invalid camera URL' });
      return null;
    }
    if (!['rtsp:', 'rtsps:', 'http:', 'https:'].includes(target.protocol)) {
      sendJson(res, 400, { error: 'Unsupported camera URL protocol' });
      return null;
    }
    log.debug('Camera widget resolved', { widgetId, protocol: target.protocol, cameraUrl: target.toString(), mode: item.settings?.mode || '' });
    return { item, target };
  }

  async #proxyCameraImage(requestUrl, res) {
    const camera = await this.#cameraSettings(requestUrl, res);
    if (!camera) return;
    if (!['http:', 'https:'].includes(camera.target.protocol)) {
      sendJson(res, 400, { error: 'Still-image mode requires an HTTP or HTTPS URL' });
      return;
    }
    const startedAt = Date.now();
    log.debug('Fetching camera image', { cameraUrl: camera.target.toString() });
    const response = await fetch(camera.target, { signal: AbortSignal.timeout(12000), redirect: 'follow' });
    if (!response.ok) {
      sendJson(res, response.status, { error: `Camera image request failed (${response.status})` });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    log.debug('Camera image fetched', { cameraUrl: camera.target.toString(), status: response.status, bytes: buffer.length, durationMs: Date.now() - startedAt });
    if (buffer.length > 20 * 1024 * 1024) {
      sendJson(res, 413, { error: 'Camera image is too large' });
      return;
    }
    res.writeHead(200, {
      'content-type': response.headers.get('content-type') || 'image/jpeg',
      'content-length': buffer.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    res.end(buffer);
  }

  async #proxyCameraStream(requestUrl, req, res) {
    const camera = await this.#cameraSettings(requestUrl, res);
    if (!camera) return;
    const { target } = camera;
    if (target.protocol === 'http:' || target.protocol === 'https:') {
      log.info('Proxying browser-compatible camera stream', { cameraUrl: target.toString() });
      const response = await fetch(target, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (!response.ok || !response.body) {
        sendJson(res, response.status || 502, { error: `Camera stream request failed (${response.status})` });
        return;
      }
      res.writeHead(200, {
        'content-type': response.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      });
      Readable.fromWeb(response.body).pipe(res);
      return;
    }

    if (this.settingsManager.onRemote) {
      sendJson(res, 409, { error: 'Direct RTSP transcoding is unavailable on Remote Two and Remote 3. Configure go2rtc or run UC Dashboard externally.' });
      return;
    }

    const args = [
      '-hide_banner', '-loglevel', 'warning', '-nostdin',
      '-rtsp_transport', 'tcp', '-rw_timeout', '20000000',
      '-fflags', '+genpts+discardcorrupt+nobuffer', '-flags', 'low_delay',
      '-analyzeduration', '2000000', '-probesize', '2000000',
      '-i', target.toString(), '-map', '0:v:0', '-an', '-sn', '-dn',
      '-c:v', 'libx264', '-profile:v', 'main', '-level:v', '4.1',
      '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
      '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration', '1000000', '-flush_packets', '1',
      '-f', 'mp4', 'pipe:1'
    ];
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    log.info('Starting external FFmpeg camera transcoder', { widgetId: camera.item.id, cameraUrl: target.toString(), ffmpegPath });
    const ffmpeg = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let started = false;
    let stderr = '';
    let closed = false;
    const cleanup = () => {
      if (closed || ffmpeg.killed) return;
      ffmpeg.kill('SIGTERM');
      setTimeout(() => { if (!closed) ffmpeg.kill('SIGKILL'); }, 1500).unref?.();
    };
    const startupTimer = setTimeout(() => {
      if (!started) {
        log.warn('FFmpeg camera startup timed out', { widgetId: camera.item.id, cameraUrl: target.toString() });
        cleanup();
        if (!res.headersSent) sendJson(res, 504, { error: `RTSP startup timed out after 20 seconds. ${stderr.trim()}`.trim() });
      }
    }, 20000);
    startupTimer.unref?.();
    req.on('close', cleanup);
    res.on('close', cleanup);
    ffmpeg.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    ffmpeg.on('error', (error) => {
      log.error('FFmpeg camera process failed to start', { widgetId: camera.item.id, ffmpegPath, error });
      clearTimeout(startupTimer);
      closed = true;
      const hint = error.code === 'ENOENT' ? `FFmpeg executable not found at ${ffmpegPath}` : error.message;
      if (!res.headersSent) sendJson(res, 503, { error: `RTSP transcoding unavailable: ${hint}` });
      else res.destroy(error);
    });
    ffmpeg.stdout.once('data', (chunk) => {
      clearTimeout(startupTimer);
      started = true;
      log.info('FFmpeg camera stream started', { widgetId: camera.item.id, cameraUrl: target.toString() });
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'x-camera-mime': 'video/mp4; codecs="avc1.4D4029"',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      });
      res.write(chunk);
      ffmpeg.stdout.pipe(res);
    });
    ffmpeg.on('close', (code, signal) => {
      clearTimeout(startupTimer);
      closed = true;
      log.info('FFmpeg camera process closed', { widgetId: camera.item.id, code, signal, started, stderrTail: stderr.trim().slice(-1000) });
      if (!started && !res.headersSent) {
        const detail = stderr.trim() || `FFmpeg exited with code ${code}${signal ? ` (${signal})` : ''}`;
        sendJson(res, 502, { error: detail });
      } else if (!res.writableEnded) res.end();
    });
  }

  async #proxyMediaImage(requestUrl, res) {
    const rawUrl = requestUrl.searchParams.get('url');
    const settings = this.settingsManager.get();
    if (!rawUrl || !settings.remoteHttpUrl) {
      sendJson(res, 400, { error: 'Missing media image URL or Remote REST URL' });
      return;
    }

    let base;
    let target;
    try {
      base = new URL(settings.remoteHttpUrl);
      target = new URL(rawUrl, base);
    } catch {
      sendJson(res, 400, { error: 'Invalid media image URL' });
      return;
    }
    if (target.origin !== base.origin) {
      sendJson(res, 403, { error: 'Only Remote-hosted media images can be proxied' });
      return;
    }

    const headers = {};
    if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
    log.debug('Proxying Remote media image', { cameraUrl: target.toString() });
    const response = await fetch(target, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      sendJson(res, response.status, { error: `Media image request failed (${response.status})` });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 12 * 1024 * 1024) {
      sendJson(res, 413, { error: 'Media image is too large' });
      return;
    }
    res.writeHead(200, {
      'content-type': response.headers.get('content-type') || 'application/octet-stream',
      'content-length': buffer.length,
      'cache-control': 'private, max-age=60',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    res.end(buffer);
  }

  async #serveStatic(pathname, res, headOnly) {
    let normalizedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    const safeRelative = path.normalize(normalizedPath).replace(/^([/\\])+/, '');
    const filePath = path.join(this.publicDir, safeRelative);
    if (!filePath.startsWith(this.publicDir)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      const extension = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME_TYPES[extension] || 'application/octet-stream',
        'content-length': fileStat.size,
        'cache-control': ['.html', '.css', '.js', '.webmanifest'].includes(extension) ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'same-origin'
      });
      if (headOnly) res.end();
      else createReadStream(filePath).pipe(res);
    } catch (error) {
      log.trace('Static asset not found', { pathname, filePath, error });
      sendJson(res, 404, { error: 'Not found' });
    }
  }
}
