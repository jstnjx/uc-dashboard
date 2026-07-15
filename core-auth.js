import { createLogger, safeUrl } from './logger.js';

const log = createLogger('core-auth');

function normalizeAddress(address) {
  if (!address) return '';
  let value = String(address).trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') value = '127.0.0.1';
  const zoneIndex = value.indexOf('%');
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
  return value;
}

function hostForUrl(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function wsUrlForHttpBase(httpBaseUrl) {
  const url = new URL(httpBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate?.httpBaseUrl) return false;
    const key = trimSlash(candidate.httpBaseUrl);
    if (seen.has(key)) return false;
    seen.add(key);
    candidate.httpBaseUrl = key;
    candidate.wsUrl ||= wsUrlForHttpBase(key);
    return true;
  });
}

export function deriveCoreEndpoints({ remoteAddress, onRemote, settings = {} }) {
  const configuredHttp = process.env.REMOTE_HTTP_URL || settings.remoteHttpUrl;
  const configuredWs = process.env.REMOTE_WS_URL || settings.remoteWsUrl;

  if (onRemote) {
    const httpBaseUrl = trimSlash(configuredHttp || 'http://127.0.0.1');
    return {
      httpBaseUrl,
      wsUrl: configuredWs || wsUrlForHttpBase(httpBaseUrl)
    };
  }

  const host = normalizeAddress(remoteAddress);
  if (!host && !configuredHttp) {
    throw new Error('Unable to determine the Remote address from the Integration API connection');
  }

  const httpBaseUrl = trimSlash(configuredHttp || `http://${hostForUrl(host)}`);
  return {
    httpBaseUrl,
    wsUrl: configuredWs || wsUrlForHttpBase(httpBaseUrl)
  };
}

export function coreEndpointCandidates({ remoteAddress, onRemote, settings = {} }) {
  const host = normalizeAddress(remoteAddress);
  const urlHost = host ? hostForUrl(host) : '';
  const configuredHttp = process.env.REMOTE_HTTP_URL || settings.remoteHttpUrl;
  const configuredWs = process.env.REMOTE_WS_URL || settings.remoteWsUrl;
  const explicitHttp = Boolean(process.env.REMOTE_HTTP_URL);
  const explicitWs = Boolean(process.env.REMOTE_WS_URL);
  const candidates = [];

  const add = (httpBaseUrl, wsUrl) => {
    if (!httpBaseUrl) return;
    candidates.push({
      httpBaseUrl: trimSlash(httpBaseUrl),
      wsUrl: wsUrl || wsUrlForHttpBase(trimSlash(httpBaseUrl))
    });
  };

  if (explicitHttp) {
    add(configuredHttp, configuredWs);
    return uniqueCandidates(candidates);
  }

  if (onRemote) {
    // Remote Two and Remote 3 expose Core through their regular HTTP endpoint.
    add('http://127.0.0.1', explicitWs ? configuredWs : undefined);
    if (host && host !== '127.0.0.1') add(`http://${urlHost}`);
    if (configuredHttp) add(configuredHttp, configuredWs);
  } else {
    if (configuredHttp) add(configuredHttp, configuredWs);
    if (host) {
      add(`http://${urlHost}`);
    }
  }

  return uniqueCandidates(candidates);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function loggedRemoteFetch({ operation, endpoint, method = 'GET', headers = {}, body, signal }) {
  const requestId = `auth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let requestPayload;
  if (typeof body === 'string' && body) {
    try { requestPayload = JSON.parse(body); } catch { requestPayload = body; }
  }
  log.debug('Remote Core API request sent', {
    direction: 'integration_to_remote_api',
    transport: 'rest',
    requestId,
    operation,
    method,
    endpoint: safeUrl(endpoint),
    request: requestPayload
  });
  try {
    const response = await fetch(endpoint, { method, headers, body, signal });
    const payload = await parseResponse(response);
    log.debug('Remote Core API response received', {
      direction: 'remote_api_to_integration',
      transport: 'rest',
      requestId,
      operation,
      method,
      endpoint: safeUrl(endpoint),
      status: response.status,
      durationMs: Date.now() - startedAt,
      response: payload
    });
    return { response, payload };
  } catch (error) {
    log.warn('Remote Core API request failed', {
      direction: 'integration_to_remote_api',
      transport: 'rest',
      requestId,
      operation,
      method,
      endpoint: safeUrl(endpoint),
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }
}

async function probeCore(httpBaseUrl) {
  const endpoint = `${trimSlash(httpBaseUrl)}/api/pub/version`;
  const { response, payload } = await loggedRemoteFetch({
    operation: 'discover_core',
    endpoint,
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000)
  });
  return { response, payload, endpoint };
}

export async function discoverCoreEndpoints(options) {
  const candidates = coreEndpointCandidates(options);
  log.info('Discovering Remote Core API endpoints', { onRemote: options.onRemote, remoteAddress: options.remoteAddress, candidates });
  if (!candidates.length) {
    throw new Error('No possible Remote Core API endpoint could be determined');
  }

  const attempts = [];
  for (const candidate of candidates) {
    try {
      log.debug('Probing Core API candidate', { httpBaseUrl: safeUrl(candidate.httpBaseUrl) });
      const result = await probeCore(candidate.httpBaseUrl);
      const model = typeof result.payload?.model === 'string' ? result.payload.model.trim().toUpperCase() : '';
      attempts.push(`${candidate.httpBaseUrl} -> ${result.response.status}${model ? ` (${model})` : ''}`);
      if (result.response.ok && (model === 'UCR2' || model === 'UCR3')) {
        log.info('Remote Core API endpoint discovered', { httpBaseUrl: candidate.httpBaseUrl, wsUrl: candidate.wsUrl, model, status: result.response.status });
        return candidate;
      }
      if (result.response.ok) attempts.push(`${candidate.httpBaseUrl} -> unsupported model ${model || 'unknown'}`);
    } catch (error) {
      log.warn('Core API candidate probe failed', { httpBaseUrl: candidate.httpBaseUrl, error });
      const detail = error instanceof Error ? error.message : String(error);
      attempts.push(`${candidate.httpBaseUrl} -> ${detail}`);
    }
  }

  log.error('Remote Core API discovery failed', { attempts });
  throw new Error(`Remote Core API was not found. Tried: ${attempts.join('; ')}`);
}

export async function createCoreApiKey({ httpBaseUrl, pin, name = 'UC Dashboard' }) {
  log.info('Requesting dedicated Core API key', { httpBaseUrl, name });
  const password = String(pin || '').trim();
  if (!password) throw new Error('The Remote PIN is required');

  const authorization = Buffer.from(`web-configurator:${password}`, 'utf8').toString('base64');
  const endpoint = `${trimSlash(httpBaseUrl)}/api/auth/api_keys`;

  async function create(keyName) {
    return loggedRemoteFetch({
      operation: 'create_api_key',
      endpoint,
      method: 'POST',
      headers: {
        authorization: `Basic ${authorization}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ name: keyName, scopes: ['admin'] }),
      signal: AbortSignal.timeout(12_000)
    });
  }

  let result = await create(name);
  log.debug('Core API key creation response', { status: result.response.status, name });
  if (result.response.status === 409 || result.response.status === 422) {
    const suffix = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const retryName = `${name} ${suffix}`;
    log.info('Core API key name already exists; retrying with unique name', { retryName, previousStatus: result.response.status });
    result = await create(retryName);
  }

  if (!result.response.ok) {
    const detail = result.payload?.message || result.payload?.error || result.payload?.description || result.response.statusText;
    if (result.response.status === 401 || result.response.status === 403) {
      throw new Error('The web-configurator PIN was rejected');
    }
    throw new Error(`Unable to create Core API key (${result.response.status}): ${detail}`);
  }

  const apiKey = result.payload?.api_key;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('The Remote did not return an API key');
  }

  const keyId = result.payload?.key_id || null;
  let active = result.payload?.active !== false;

  if (!active) {
    if (!keyId) throw new Error('The Remote created an inactive API key without a key identifier');
    log.info('Activating newly created Core API key', { keyId });
    const { response: activateResponse, payload: activatePayload } = await loggedRemoteFetch({
      operation: 'activate_api_key',
      endpoint: `${endpoint}/${encodeURIComponent(keyId)}`,
      method: 'PATCH',
      headers: {
        authorization: `Basic ${authorization}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ active: true }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!activateResponse.ok) {
      const detail = activatePayload?.message || activatePayload?.error || activatePayload?.description || activateResponse.statusText;
      throw new Error(`Core API key was created but could not be activated (${activateResponse.status}): ${detail}`);
    }
    active = activatePayload?.active !== false;
    if (!active) throw new Error('The Remote did not activate the new Core API key');
  }

  log.info('Core API key ready', { keyId, name: result.payload?.name || name, active });
  return {
    apiKey,
    active,
    keyId,
    name: result.payload?.name || name
  };
}
