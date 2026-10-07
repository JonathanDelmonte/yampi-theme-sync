import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {zipSync} from 'fflate';
import {createHash} from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const entries = Object.create(null);
// Allowlist excludes the development demo, source, dependencies, and any client exports.
for (const name of ['manifest.json', 'background.js', 'bridge.js', 'panel.js', 'panel.html', 'panel.css']) entries[name] = new Uint8Array(await readFile(path.join(root, 'dist', name)));
entries['INSTRUCOES.md'] = new Uint8Array(await readFile(path.join(root, 'docs/INSTALACAO.md')));
entries['TERCEIROS.md'] = new Uint8Array(await readFile(path.join(root, 'docs/TERCEIROS.md')));
const bytes = zipSync(entries, {level: 6});
const out = path.join(root, 'releases');
await mkdir(out, {recursive: true});
const {version} = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
const name = `yampi-theme-sync-${version}.zip`;
await writeFile(path.join(out, name), bytes);
await writeFile(path.join(out, name + '.sha256'), createHash('sha256').update(bytes).digest('hex') + '  ' + name + '\n');
console.log('Pacote pronto: releases/' + name);
