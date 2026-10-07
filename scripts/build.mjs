import {build} from 'esbuild';
import {mkdir, cp, writeFile, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await mkdir(dist, {recursive: true});
// Only these generated files are removed; never touch client files or exports.
for (const name of ['background.js', 'bridge.js', 'panel.js', 'fixture.js']) await rm(path.join(dist, name), {force: true});
await cp(path.join(root, 'extension'), dist, {recursive: true});
const raw = {name: 'raw', setup(builder) {
  builder.onResolve({filter: /\?raw$/}, args => ({path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw'}));
  builder.onLoad({filter: /.*/, namespace: 'raw'}, async args => ({contents: await readFile(args.path, 'utf8'), loader: 'text'}));
}};
const common = {bundle: true, target: 'chrome120', sourcemap: false, minify: true, legalComments: 'eof', logLevel: 'warning', plugins: [raw]};
await build({...common, entryPoints: [path.join(root, 'src/browser/background.ts')], outfile: path.join(dist, 'background.js'), format: 'esm'});
await build({...common, entryPoints: [path.join(root, 'src/browser/bridge.ts')], outfile: path.join(dist, 'bridge.js'), format: 'iife', globalName: 'YampiThemeSyncBridge'});
await build({...common, entryPoints: [path.join(root, 'src/panel.ts')], outfile: path.join(dist, 'panel.js'), format: 'esm'});
await build({...common, entryPoints: [path.join(root, 'src/demo/fixture.ts')], outfile: path.join(dist, 'fixture.js'), format: 'esm'});
const html = await readFile(path.join(root, 'extension/panel.html'), 'utf8');
await writeFile(path.join(dist, 'demo.html'), html);
await cp(path.join(root, 'src/demo/fixture.html'), path.join(dist, 'fixture.html'));
let notices = '# Componentes de terceiros\n\nLicenças dos componentes incluídos nos arquivos JavaScript da extensão. Ferramentas usadas apenas para desenvolvimento não são distribuídas no pacote.\n';
for (const name of ['fflate', '@codemirror/view', '@codemirror/state', '@marijn/find-cluster-break', 'crelt', 'style-mod', 'w3c-keyname']) {
  const folder = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  const license = await readFile(path.join(folder, 'LICENSE'), 'utf8');
  notices += `\n## ${name} ${pkg.version}\n\n${license.trim()}\n`;
}
await mkdir(path.join(root, 'docs'), {recursive: true});
await writeFile(path.join(root, 'docs/TERCEIROS.md'), notices);
await writeFile(path.join(dist, 'TERCEIROS.md'), notices);
console.log('Build pronto: dist/ (extensão) e http://127.0.0.1:5181/demo.html?demo=1 (teste).');
