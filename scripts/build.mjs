import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const config = JSON.parse(await readFile(resolve(root, 'app.config.json'), 'utf8'));
const buildId = createHash('sha256')
  .update(await readFile(resolve(root, 'package-lock.json')))
  .update(await readFile(resolve(root, 'app.config.json')))
  .update(String(Date.now()))
  .digest('hex')
  .slice(0, 16);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });
await cp(resolve(root, 'src'), resolve(output, 'src'), { recursive: true });
await cp(resolve(root, 'app.config.json'), resolve(output, 'app.config.json'));
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({
  name: config.app.name,
  versionName: config.app.versionName,
  versionCode: config.app.versionCode,
  projectSchemaVersion: config.app.projectSchemaVersion,
  buildId,
  builtAt: new Date().toISOString(),
}, null, 2));

const indexPath = resolve(output, 'index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('./bootstrap.js')) throw new Error('Entry point bootstrap.js tidak ditemukan pada index.html.');
await writeFile(indexPath, index.replaceAll('__BUILD_ID__', buildId));
const bootstrapPath = resolve(output, 'bootstrap.js');
const bootstrap = await readFile(bootstrapPath, 'utf8');
await writeFile(bootstrapPath, bootstrap.replaceAll('__BUILD_ID__', buildId));
const serviceWorkerPath = resolve(output, 'service-worker.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
await writeFile(serviceWorkerPath, serviceWorker
  .replaceAll('__APP_VERSION__', config.app.versionName)
  .replaceAll('__BUILD_ID__', buildId));
console.log(`Built ${config.app.name} v${config.app.versionName} → dist/`);
