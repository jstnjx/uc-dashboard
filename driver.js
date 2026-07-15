import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoreClient } from './core-client.js';
import { DashboardServer } from './dashboard-server.js';
import { IntegrationServer } from './integration-server.js';
import { SettingsManager } from './settings-manager.js';
import { createLogger, setLogLevel } from './logger.js';

const log = createLogger('driver');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ON_REMOTE = Boolean(process.env.UC_DATA_HOME || process.env.UC_CONFIG_HOME);
const INTEGRATION_PORT = Number.parseInt(process.env.UC_INTEGRATION_HTTP_PORT || '9090', 10);
const DATA_DIR = path.resolve(process.env.UC_DATA_HOME || process.env.DATA_DIR || path.join(__dirname, 'data'));
const CONFIG_DIR = path.resolve(process.env.UC_CONFIG_HOME || process.env.CONFIG_DIR || path.join(__dirname, 'config'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DRIVER_FILE = path.join(__dirname, 'driver.json');

const settingsManager = new SettingsManager({ configDir: CONFIG_DIR, onRemote: ON_REMOTE, integrationPort: INTEGRATION_PORT });
await settingsManager.initialize();
setLogLevel(settingsManager.get().logLevel);
log.info('UC Dashboard starting', {
  version: '1.12.1',
  deployment: ON_REMOTE ? 'remote' : 'external',
  dataDir: DATA_DIR,
  configDir: CONFIG_DIR,
  publicDir: PUBLIC_DIR,
  integrationPort: INTEGRATION_PORT,
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch
});

const coreClient = new CoreClient(() => settingsManager.get());
let dashboardServer;

function runtime() {
  const settings = settingsManager.get();
  return {
    ...coreClient.runtime(),
    deployment: ON_REMOTE ? 'remote' : 'external',
    onRemote: ON_REMOTE,
    dashboardListening: Boolean(dashboardServer?.listening),
    dashboardPort: settings.dashboardPort,
    integrationPort: INTEGRATION_PORT,
    chargingGated: settings.chargingGated,
    settings: settingsManager.forUi()
  };
}

async function applyDashboardListener() {
  const settings = settingsManager.get();
  const shouldListen = !settings.chargingGated || coreClient.powerSupply !== false;
  log.debug('Evaluating dashboard listener state', { shouldListen, listening: dashboardServer.listening, chargingGated: settings.chargingGated, powerSupply: coreClient.powerSupply });
  if (shouldListen && !dashboardServer.listening) {
    try {
      await dashboardServer.start();
    } catch (error) {
      log.error('Unable to start dashboard listener', { error });
    }
  } else if (!shouldListen && dashboardServer.listening) {
    await dashboardServer.stop('UC Dashboard paused because the Remote is not charging');
  }
}

async function onSettingsChanged(result) {
  setLogLevel(settingsManager.get().logLevel);
  log.info('Applying settings changes', result);
  if (result.connectionChanged) coreClient.configure();
  if (result.entitiesChanged) dashboardServer.broadcast('entities', dashboardServer.entities());
  if (result.listenerChanged) {
    const wasListening = dashboardServer.listening;
    if (wasListening) await dashboardServer.stop('Restarting dashboard listener');
    await applyDashboardListener();
  }
  dashboardServer.broadcast('runtime', runtime());
}

dashboardServer = new DashboardServer({
  publicDir: PUBLIC_DIR,
  dataDir: DATA_DIR,
  settingsManager,
  coreClient,
  runtimeProvider: runtime,
  onSettingsChanged
});
await dashboardServer.initialize();

const integrationServer = new IntegrationServer({
  driverFile: DRIVER_FILE,
  coreClient,
  settingsManager,
  onRemote: ON_REMOTE,
  onProvisioned: onSettingsChanged
});
await integrationServer.start();
log.info('Integration API started');

coreClient.on('power', () => void applyDashboardListener());
coreClient.on('runtime', () => dashboardServer.broadcast('runtime', runtime()));

await applyDashboardListener();
coreClient.connect();
log.info('UC Dashboard startup completed');

async function shutdown(signal = 'shutdown') {
  log.info('UC Dashboard shutting down', { signal });
  coreClient.disconnect(true);
  await dashboardServer.stop('UC Dashboard stopped');
  await integrationServer.stop();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => log.error('Uncaught exception', { error }));
process.on('unhandledRejection', (error) => log.error('Unhandled rejection', { error }));
