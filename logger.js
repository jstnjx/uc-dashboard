const LEVELS = Object.freeze({ trace: 10, debug: 20, info: 30, warn: 40, error: 50, silent: 99 });
const SENSITIVE_KEY = /(?:api[_-]?key|token|authorization|password|passwd|pin|secret|credential|cookie|session|source[_-]?url|camera[_-]?url)/i;
const URL_KEY = /(?:^|_)(?:url|uri|endpoint)$/i;
let activeLevel = normalizeLogLevel(process.env.UC_DASHBOARD_LOG_LEVEL || process.env.LOG_LEVEL || 'info');

export function normalizeLogLevel(value, fallback = 'info') {
  const level = String(value || '').trim().toLowerCase();
  return Object.hasOwn(LEVELS, level) ? level : fallback;
}

export function setLogLevel(value) {
  activeLevel = normalizeLogLevel(value, activeLevel);
  return activeLevel;
}

export function getLogLevel() {
  return activeLevel;
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.toString();
  } catch {
    return String(value || '').replace(/:\/\/([^/@:]+):([^/@]+)@/g, '://[redacted]:[redacted]@');
  }
}

function sanitize(value, key = '', seen = new WeakSet(), depth = 0) {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.code !== undefined ? { code: value.code } : {}),
      ...(value.statusCode !== undefined ? { statusCode: value.statusCode } : {}),
      ...(activeLevel === 'trace' && value.stack ? { stack: value.stack } : {})
    };
  }
  if (typeof value === 'string') {
    if (URL_KEY.test(key) || /^wss?:\/\//i.test(value) || /^https?:\/\//i.test(value) || /^rtsps?:\/\//i.test(value)) return safeUrl(value);
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (depth >= 6) return '[max-depth]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const result = value.slice(0, 100).map((entry) => sanitize(entry, key, seen, depth + 1));
      if (value.length > 100) result.push(`[${value.length - 100} more]`);
      return result;
    }
    const result = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, 100)) {
      result[entryKey] = sanitize(entryValue, entryKey, seen, depth + 1);
    }
    if (Object.keys(value).length > 100) result._truncated = true;
    return result;
  }
  return String(value);
}

function emit(level, component, message, metadata) {
  if (LEVELS[level] < LEVELS[activeLevel]) return;
  const record = {
    time: new Date().toISOString(),
    level,
    component,
    message: String(message || '')
  };
  if (metadata !== undefined) record.data = sanitize(metadata);
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(component) {
  const name = String(component || 'app');
  return Object.freeze({
    trace(message, metadata) { emit('trace', name, message, metadata); },
    debug(message, metadata) { emit('debug', name, message, metadata); },
    info(message, metadata) { emit('info', name, message, metadata); },
    warn(message, metadata) { emit('warn', name, message, metadata); },
    error(message, metadata) { emit('error', name, message, metadata); }
  });
}
