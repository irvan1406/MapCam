import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'app.config.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (config.app.versionName !== packageJson.version) {
  throw new Error(`Version mismatch: app.config.json=${config.app.versionName}, package.json=${packageJson.version}`);
}
if (!/^\d+\.\d+\.\d+$/.test(config.app.versionName)) throw new Error('versionName harus mengikuti MAJOR.MINOR.PATCH.');
if (!Number.isInteger(config.app.versionCode) || config.app.versionCode < 1) throw new Error('versionCode harus bilangan positif.');
console.log(`Version OK: ${config.app.versionName} (${config.app.versionCode})`);
