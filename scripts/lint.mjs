import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');
const files = await walk(sourceRoot);
const errors = [];

for (const file of files.filter((item) => extname(item) === '.js')) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) errors.push(`${file}: ${syntax.stderr.trim()}`);
  const content = await readFile(file, 'utf8');
  if (/\b(?:TODO|FIXME):?\s+(?:dummy|placeholder)/i.test(content)) errors.push(`${file}: dummy/TODO implementation found`);
  for (const match of content.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const dependency = resolve(file, '..', match[1]);
    try { await readFile(dependency); } catch { errors.push(`${file}: missing import ${match[1]}`); }
  }
}

const css = await readFile(resolve(sourceRoot, 'styles.css'), 'utf8');
let balance = 0;
for (const character of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
  if (character === '{') balance += 1;
  if (character === '}') balance -= 1;
  if (balance < 0) break;
}
if (balance !== 0) errors.push(`styles.css: unbalanced braces (${balance})`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Lint passed: ${files.length} source files checked.`);

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(path);
  }
  return output;
}
