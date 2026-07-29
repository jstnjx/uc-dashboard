import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const driverFile = path.join(moduleDirectory, 'driver.json');

export const integrationInfo = Object.freeze(JSON.parse(readFileSync(driverFile, 'utf8')));
export const INTEGRATION_VERSION = String(integrationInfo.version || '').trim();

if (!INTEGRATION_VERSION) {
  throw new Error(`Missing integration version in ${driverFile}`);
}
