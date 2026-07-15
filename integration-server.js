import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { acceptWebSocket } from './simple-ws-server.js';
import { createCoreApiKey, discoverCoreEndpoints } from './core-auth.js';
import { createLogger } from './logger.js';

const log = createLogger('integration-server');

function response(reqId, msg, msgData = {}, code = 200) {
  return { kind: 'resp', req_id: Number.isInteger(reqId) ? reqId : 0, msg, code, msg_data: msgData };
}

function setupEvent(msgData) {
  return { kind: 'event', msg: 'driver_setup_change', cat: 'DEVICE', msg_data: msgData };
}

export class IntegrationServer {
  constructor({ driverFile, coreClient, settingsManager, onRemote, onProvisioned }) {
    this.driverFile = driverFile;
    this.coreClient = coreClient;
    this.settingsManager = settingsManager;
    this.onRemote = onRemote;
    this.onProvisioned = onProvisioned;
    this.driverInfo = null;
    this.server = null;
    this.clients = new Map();
    this.interface = process.env.UC_INTEGRATION_INTERFACE || '0.0.0.0';
    this.port = Number.parseInt(process.env.UC_INTEGRATION_HTTP_PORT || '9090', 10);
    this.operational = false;
    this.nextClientId = 1;
  }

  async start() {
    this.driverInfo = JSON.parse(await readFile(this.driverFile, 'utf8'));
    if (process.env.DRIVER_URL) this.driverInfo.driver_url = process.env.DRIVER_URL;

    this.server = http.createServer((req, res) => {
      res.writeHead(426, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'WebSocket upgrade required' }));
    });

    this.server.on('upgrade', (req, socket, head) => {
      const connection = acceptWebSocket(req, socket, head);
      if (!connection) return;

      const clientId = this.nextClientId++;
      this.clients.set(connection, {
        clientId,
        remoteAddress: req.socket.remoteAddress || '',
        setupInProgress: false,
        connectedAt: Date.now()
      });
      log.info('Integration API client connected', { clientId, remoteAddress: req.socket.remoteAddress || '', userAgent: req.headers['user-agent'] || '' });
      connection.on('message', (message) => void this.#handleMessage(connection, message));
      connection.on('close', (code, reason) => {
        const metadata = this.clients.get(connection);
        log.info('Integration API client disconnected', { clientId: metadata?.clientId, code, reason: reason?.toString?.() || '', connectedMs: metadata ? Date.now() - metadata.connectedAt : undefined });
        this.clients.delete(connection);
      });
      connection.on('error', (error) => {
        const metadata = this.clients.get(connection);
        log.warn('Integration API client error', { clientId: metadata?.clientId, error });
        this.clients.delete(connection);
      });

      this.#sendMessage(connection, response(0, 'authentication', {
        version: { api: this.driverInfo.min_core_api, driver: this.driverInfo.version }
      }, 200));
      this.#sendDeviceState(connection);
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.interface, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.operational = true;
    log.info('Integration API listening', { interface: this.interface, port: this.port, driverVersion: this.driverInfo.version, minCoreApi: this.driverInfo.min_core_api });
  }

  async stop() {
    log.info('Stopping Integration API', { clients: this.clients.size });
    this.operational = false;
    this.broadcastDeviceState();
    for (const client of this.clients.keys()) client.close(1001, 'Server stopping');
    this.clients.clear();
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  deviceState() {
    return this.operational ? 'CONNECTED' : 'DISCONNECTED';
  }

  #deviceStateEvent() {
    return {
      kind: 'event',
      msg: 'device_state',
      cat: 'DEVICE',
      msg_data: { state: this.deviceState() }
    };
  }

  #sendMessage(connection, message, context = {}) {
    const metadata = this.clients.get(connection);
    log.debug('Integration API message sent', {
      direction: 'integration_to_remote',
      clientId: metadata?.clientId,
      remoteAddress: metadata?.remoteAddress,
      kind: message?.kind,
      message: message?.msg,
      requestId: message?.req_id,
      code: message?.code,
      payload: message,
      ...context
    });
    connection.sendJson(message);
  }

  #sendDeviceState(connection) {
    this.#sendMessage(connection, this.#deviceStateEvent());
  }

  broadcastDeviceState() {
    const event = this.#deviceStateEvent();
    for (const client of this.clients.keys()) this.#sendMessage(client, event, { broadcast: true });
  }

  #requestPin(connection, error = '') {
    const errorText = error ? `\n\nLast attempt failed: ${error}` : '';
    this.#sendMessage(connection, setupEvent({
      event_type: 'SETUP',
      state: 'WAIT_USER_ACTION',
      require_user_action: {
        input: {
          title: { en: 'Connect UC Dashboard' },
          settings: [
            {
              id: 'setup-info',
              label: { en: 'Remote Core API access' },
              field: {
                label: {
                  value: {
                    en: `Enter the PIN currently shown for the Remote web configurator. The integration uses web-configurator authentication once to create and securely store its own Core API key.${errorText}`
                  }
                }
              }
            },
            {
              id: 'pin',
              label: { en: 'Web configurator PIN' },
              field: { password: {} }
            }
          ]
        }
      }
    }));
  }

  async #provision(connection, pin) {
    const metadata = this.clients.get(connection);
    if (!metadata) return;
    metadata.setupInProgress = true;
    log.info('Starting Core API provisioning', { clientId: metadata.clientId, remoteAddress: metadata.remoteAddress, onRemote: this.onRemote });

    try {
      const endpoints = await discoverCoreEndpoints({
        remoteAddress: metadata.remoteAddress,
        onRemote: this.onRemote,
        settings: this.settingsManager.get()
      });
      const key = await createCoreApiKey({
        httpBaseUrl: endpoints.httpBaseUrl,
        pin,
        name: 'UC Dashboard'
      });

      const change = await this.settingsManager.setCoreCredentials({
        remoteHttpUrl: endpoints.httpBaseUrl,
        remoteWsUrl: endpoints.wsUrl,
        apiKey: key.apiKey,
        apiKeyName: key.name,
        apiKeyId: key.keyId
      });

      await this.onProvisioned?.(change);
      metadata.setupInProgress = false;
      this.#sendMessage(connection, setupEvent({ event_type: 'STOP', state: 'OK' }));
      this.broadcastDeviceState();
      log.info('Core API access provisioned', { clientId: metadata.clientId, httpBaseUrl: endpoints.httpBaseUrl, wsUrl: endpoints.wsUrl, apiKeyName: key.name, keyId: key.keyId });
    } catch (error) {
      metadata.setupInProgress = false;
      const message = error instanceof Error ? error.message : String(error);
      log.error('Core API provisioning failed', { clientId: metadata.clientId, error });
      this.#requestPin(connection, message);
      this.broadcastDeviceState();
    }
  }

  async #handleMessage(connection, raw) {
    const metadata = this.clients.get(connection);
    let message;
    try { message = JSON.parse(raw); } catch (error) {
      log.warn('Ignoring invalid Integration API message', { clientId: metadata?.clientId, error });
      return;
    }
    log.debug('Integration API message received', {
      direction: 'remote_to_integration',
      clientId: metadata?.clientId,
      remoteAddress: metadata?.remoteAddress,
      kind: message.kind,
      message: message.msg,
      requestId: message.id,
      payload: message
    });

    if (message.kind === 'event') {
      if (message.msg === 'connect') this.#sendDeviceState(connection);
      return;
    }
    if (message.kind !== 'req') return;

    const id = message.id;
    switch (message.msg) {
      case 'auth':
        this.#sendMessage(connection, response(id, 'authentication', {
          version: { api: this.driverInfo.min_core_api, driver: this.driverInfo.version }
        }, 200));
        this.#sendDeviceState(connection);
        break;
      case 'get_driver_version':
        this.#sendMessage(connection, response(id, 'driver_version', {
          name: this.driverInfo.name?.en || Object.values(this.driverInfo.name || {})[0] || this.driverInfo.driver_id,
          version: { api: this.driverInfo.min_core_api, driver: this.driverInfo.version }
        }));
        break;
      case 'get_driver_metadata':
        this.#sendMessage(connection, response(id, 'driver_metadata', this.driverInfo));
        break;
      case 'get_device_state':
        this.#sendDeviceState(connection);
        break;
      case 'setup_driver': {
        this.#sendMessage(connection, response(id, 'result'));
        const pin = message.msg_data?.setup_data?.pin;
        setTimeout(() => {
          if (pin) void this.#provision(connection, pin);
          else this.#requestPin(connection);
        }, 50);
        break;
      }
      case 'set_driver_user_data': {
        this.#sendMessage(connection, response(id, 'result'));
        const pin = message.msg_data?.input_values?.pin;
        setTimeout(() => {
          if (pin) void this.#provision(connection, pin);
          else this.#requestPin(connection, 'PIN is required');
        }, 50);
        break;
      }
      case 'subscribe_events':
      case 'unsubscribe_events':
        this.#sendMessage(connection, response(id, 'result'));
        break;
      case 'get_available_entities':
        this.#sendMessage(connection, response(id, 'available_entities', { available_entities: [] }));
        break;
      case 'get_entity_states':
        this.#sendMessage(connection, response(id, 'entity_states', []));
        break;
      default:
        log.warn('Unsupported Integration API request', { clientId: metadata?.clientId, msg: message.msg });
        this.#sendMessage(connection, response(id, 'result', { message: `Unsupported request: ${message.msg}` }, 501));
        break;
    }
  }
}
