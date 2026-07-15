import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger, normalizeLogLevel, setLogLevel } from './logger.js';

const log = createLogger('settings');

function boolFromEnv(value, fallback) {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

export class SettingsManager {
  constructor({ configDir, onRemote, integrationPort }) {
    this.configDir = configDir;
    this.file = path.join(configDir, 'settings.json');
    this.onRemote = onRemote;
    this.integrationPort = integrationPort;
    this.settings = null;
  }

  async initialize() {
    await mkdir(this.configDir, { recursive: true });
    const defaults = {
      remoteHttpUrl: process.env.REMOTE_HTTP_URL || (this.onRemote ? 'http://127.0.0.1' : ''),
      remoteWsUrl: process.env.REMOTE_WS_URL || (this.onRemote ? 'ws://127.0.0.1/ws' : ''),
      apiKey: process.env.REMOTE_API_KEY || '',
      apiKeyName: '',
      apiKeyId: '',
      provisionedAt: '',
      reconnect: true,
      chargingGated: boolFromEnv(process.env.CHARGING_GATED, false),
      chargingGatedConfigured: process.env.CHARGING_GATED !== undefined,
      dashboardHost: process.env.DASHBOARD_HOST || '0.0.0.0',
      dashboardPort: Number.parseInt(process.env.DASHBOARD_PORT || '11080', 10),
      logLevel: normalizeLogLevel(process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL || 'info'),
      unfoldedToolsApiKey: process.env.UNFOLDED_TOOLS_API_KEY || '',
      unfoldedToolsCacheSelected: boolFromEnv(process.env.UNFOLDED_TOOLS_CACHE_SELECTED, true),
      unfoldedToolsIncludeInBackup: boolFromEnv(process.env.UNFOLDED_TOOLS_INCLUDE_IN_BACKUP, true)
    };

    let stored = {};
    if (existsSync(this.file)) {
      try {
        stored = JSON.parse(await readFile(this.file, 'utf8'));
      } catch (error) {
        log.warn('Stored settings could not be parsed; using defaults', { settingsFile: this.file, error });
        stored = {};
      }
    }
    delete stored['demo' + 'Mode'];
    const legacyRemoteChargingGate = this.onRemote
      && process.env.CHARGING_GATED === undefined
      && stored.chargingGated === true
      && stored.chargingGatedConfigured !== true;
    this.settings = { ...defaults, ...stored };

    if (legacyRemoteChargingGate) {
      this.settings.chargingGated = false;
      this.settings.chargingGatedConfigured = false;
      log.warn('Disabled legacy charging-gated dashboard default so the HTTP listener remains reachable while the Remote is off the charger', {
        dashboardPort: this.settings.dashboardPort
      });
    }

    if (process.env.REMOTE_HTTP_URL) this.settings.remoteHttpUrl = process.env.REMOTE_HTTP_URL;
    if (process.env.REMOTE_WS_URL) this.settings.remoteWsUrl = process.env.REMOTE_WS_URL;
    if (process.env.REMOTE_API_KEY) this.settings.apiKey = process.env.REMOTE_API_KEY;
    if (process.env.DASHBOARD_HOST) this.settings.dashboardHost = process.env.DASHBOARD_HOST;
    if (process.env.DASHBOARD_PORT) this.settings.dashboardPort = Number.parseInt(process.env.DASHBOARD_PORT, 10);
    if (process.env.CHARGING_GATED !== undefined) {
      this.settings.chargingGated = boolFromEnv(process.env.CHARGING_GATED, false);
      this.settings.chargingGatedConfigured = true;
    }
    if (process.env.UNFOLDED_TOOLS_API_KEY) this.settings.unfoldedToolsApiKey = process.env.UNFOLDED_TOOLS_API_KEY;
    if (process.env.UNFOLDED_TOOLS_CACHE_SELECTED !== undefined) this.settings.unfoldedToolsCacheSelected = boolFromEnv(process.env.UNFOLDED_TOOLS_CACHE_SELECTED, true);
    if (process.env.UNFOLDED_TOOLS_INCLUDE_IN_BACKUP !== undefined) this.settings.unfoldedToolsIncludeInBackup = boolFromEnv(process.env.UNFOLDED_TOOLS_INCLUDE_IN_BACKUP, true);
    if (process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL) {
      this.settings.logLevel = normalizeLogLevel(process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL);
    } else {
      this.settings.logLevel = normalizeLogLevel(this.settings.logLevel);
    }

    setLogLevel(this.settings.logLevel);
    this.#validatePort(this.settings.dashboardPort);
    await this.#save();
    log.info('Settings initialized', {
      configFile: this.file,
      onRemote: this.onRemote,
      dashboardHost: this.settings.dashboardHost,
      dashboardPort: this.settings.dashboardPort,
      reconnect: this.settings.reconnect,
      chargingGated: this.settings.chargingGated,
      logLevel: this.settings.logLevel,
      hasApiKey: Boolean(this.settings.apiKey),
      unfoldedToolsApiKeyConfigured: Boolean(this.settings.unfoldedToolsApiKey),
      unfoldedToolsCacheSelected: Boolean(this.settings.unfoldedToolsCacheSelected),
      unfoldedToolsIncludeInBackup: Boolean(this.settings.unfoldedToolsIncludeInBackup),
      remoteHttpUrl: this.settings.remoteHttpUrl,
      remoteWsUrl: this.settings.remoteWsUrl
    });
  }

  get() {
    return this.settings;
  }

  backupForExport() {
    return {
      reconnect: Boolean(this.settings.reconnect),
      chargingGated: Boolean(this.settings.chargingGated),
      dashboardPort: Number(this.settings.dashboardPort),
      logLevel: normalizeLogLevel(this.settings.logLevel),
      unfoldedToolsCacheSelected: Boolean(this.settings.unfoldedToolsCacheSelected),
      unfoldedToolsIncludeInBackup: Boolean(this.settings.unfoldedToolsIncludeInBackup)
    };
  }

  validateBackupSettings(body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Backup settings must be an object');
    if (body.dashboardPort !== undefined && !process.env.DASHBOARD_PORT) {
      const port = Number.parseInt(String(body.dashboardPort), 10);
      this.#validatePort(port);
    }
    if (body.logLevel !== undefined) normalizeLogLevel(body.logLevel);
    return true;
  }

  forUi() {
    return {
      remoteHttpUrl: this.settings.remoteHttpUrl,
      remoteWsUrl: this.settings.remoteWsUrl,
      apiKeyConfigured: Boolean(this.settings.apiKey),
      apiKeyName: this.settings.apiKeyName,
      provisionedAt: this.settings.provisionedAt,
      reconnect: this.settings.reconnect,
      chargingGated: this.settings.chargingGated,
      dashboardHost: this.settings.dashboardHost,
      dashboardPort: this.settings.dashboardPort,
      logLevel: this.settings.logLevel,
      unfoldedToolsApiKeyConfigured: Boolean(this.settings.unfoldedToolsApiKey),
      unfoldedToolsCacheSelected: Boolean(this.settings.unfoldedToolsCacheSelected),
      unfoldedToolsIncludeInBackup: Boolean(this.settings.unfoldedToolsIncludeInBackup),
      onRemote: this.onRemote,
      environmentOverrides: {
        remoteHttpUrl: Boolean(process.env.REMOTE_HTTP_URL),
        remoteWsUrl: Boolean(process.env.REMOTE_WS_URL),
        apiKey: Boolean(process.env.REMOTE_API_KEY),
        dashboardPort: Boolean(process.env.DASHBOARD_PORT),
        chargingGated: process.env.CHARGING_GATED !== undefined,
        logLevel: Boolean(process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL),
        unfoldedToolsApiKey: Boolean(process.env.UNFOLDED_TOOLS_API_KEY),
        unfoldedToolsCacheSelected: process.env.UNFOLDED_TOOLS_CACHE_SELECTED !== undefined,
        unfoldedToolsIncludeInBackup: process.env.UNFOLDED_TOOLS_INCLUDE_IN_BACKUP !== undefined
      }
    };
  }

  async setCoreCredentials({ remoteHttpUrl, remoteWsUrl, apiKey, apiKeyName = '', apiKeyId = '' }) {
    const previous = { ...this.settings };
    if (!process.env.REMOTE_HTTP_URL) this.settings.remoteHttpUrl = String(remoteHttpUrl || '').trim();
    if (!process.env.REMOTE_WS_URL) this.settings.remoteWsUrl = String(remoteWsUrl || '').trim();
    if (!process.env.REMOTE_API_KEY) this.settings.apiKey = String(apiKey || '').trim();
    this.settings.apiKeyName = apiKeyName;
    this.settings.apiKeyId = apiKeyId || '';
    this.settings.provisionedAt = new Date().toISOString();
    await this.#save();
    log.info('Core credentials updated', {
      remoteHttpUrl: this.settings.remoteHttpUrl,
      remoteWsUrl: this.settings.remoteWsUrl,
      apiKeyName: this.settings.apiKeyName,
      hasApiKey: Boolean(this.settings.apiKey),
      provisionedAt: this.settings.provisionedAt
    });

    return {
      connectionChanged: previous.remoteWsUrl !== this.settings.remoteWsUrl || previous.apiKey !== this.settings.apiKey,
      listenerChanged: false,
      entitiesChanged: false
    };
  }

  async update(body) {
    const previous = { ...this.settings };
    if (typeof body.reconnect === 'boolean') this.settings.reconnect = body.reconnect;
    if (typeof body.chargingGated === 'boolean' && process.env.CHARGING_GATED === undefined) {
      this.settings.chargingGated = body.chargingGated;
      this.settings.chargingGatedConfigured = true;
    }
    if (typeof body.unfoldedToolsCacheSelected === 'boolean' && process.env.UNFOLDED_TOOLS_CACHE_SELECTED === undefined) this.settings.unfoldedToolsCacheSelected = body.unfoldedToolsCacheSelected;
    if (typeof body.unfoldedToolsIncludeInBackup === 'boolean' && process.env.UNFOLDED_TOOLS_INCLUDE_IN_BACKUP === undefined) this.settings.unfoldedToolsIncludeInBackup = body.unfoldedToolsIncludeInBackup;
    if (body.clearUnfoldedToolsApiKey === true && !process.env.UNFOLDED_TOOLS_API_KEY) this.settings.unfoldedToolsApiKey = '';
    if (typeof body.unfoldedToolsApiKey === 'string' && body.unfoldedToolsApiKey.trim() && !process.env.UNFOLDED_TOOLS_API_KEY) this.settings.unfoldedToolsApiKey = body.unfoldedToolsApiKey.trim();
    if (body.logLevel !== undefined && !(process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL)) {
      this.settings.logLevel = normalizeLogLevel(body.logLevel);
      setLogLevel(this.settings.logLevel);
    }
    if (body.dashboardPort !== undefined && !process.env.DASHBOARD_PORT) {
      const port = Number.parseInt(String(body.dashboardPort), 10);
      this.#validatePort(port);
      this.settings.dashboardPort = port;
    }
    await this.#save();
    log.info('Settings updated', {
      reconnect: this.settings.reconnect,
      chargingGated: this.settings.chargingGated,
      dashboardPort: this.settings.dashboardPort,
      logLevel: this.settings.logLevel,
      unfoldedToolsApiKeyConfigured: Boolean(this.settings.unfoldedToolsApiKey),
      unfoldedToolsCacheSelected: Boolean(this.settings.unfoldedToolsCacheSelected),
      unfoldedToolsIncludeInBackup: Boolean(this.settings.unfoldedToolsIncludeInBackup)
    });

    return {
      connectionChanged: previous.reconnect !== this.settings.reconnect,
      listenerChanged: previous.dashboardPort !== this.settings.dashboardPort || previous.chargingGated !== this.settings.chargingGated,
      entitiesChanged: false
    };
  }

  async #save() {
    await writeJsonAtomic(this.file, this.settings);
  }

  #validatePort(port) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Dashboard port must be between 1024 and 65535');
    if (port === this.integrationPort) throw new Error('Dashboard port cannot equal the Integration API port');
    if (this.onRemote && ((port >= 8000 && port <= 9200) || port === 13333)) {
      throw new Error('This port is reserved by the Remote. Use a port above 10000, excluding 13333.');
    }
  }
}
