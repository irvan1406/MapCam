import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const config = JSON.parse(await readFile(resolve(root, 'app.config.json'), 'utf8'));

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
  builtAt: new Date().toISOString(),
}, null, 2));

const index = await readFile(resolve(output, 'index.html'), 'utf8');
if (!index.includes('./src/main.js')) throw new Error('Entry point src/main.js tidak ditemukan pada index.html.');
const serviceWorkerPath = resolve(output, 'service-worker.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
await writeFile(serviceWorkerPath, serviceWorker.replaceAll('__APP_VERSION__', config.app.versionName));
console.log(`Built ${config.app.name} v${config.app.versionName} → dist/`);
