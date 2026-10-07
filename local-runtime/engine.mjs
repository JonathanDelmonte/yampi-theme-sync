import path from 'node:path';
import {readdir, readFile, lstat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Twig from 'twig';
import * as sass from 'sass';
import compiler from 'vue-template-compiler';
import {compileStyle} from 'vue/compiler-sfc';
import {build} from 'esbuild';
const MAX_FILE = 2 * 1024 * 1024, MAX_TOTAL = 32 * 1024 * 1024, MAX_FILES = 3000;
const roots = ['assets', 'components', 'elements', 'sections', 'templates'];
export const digest = data => createHash('sha256').update(data).digest('hex');
export function validateContent(name, bytes) {
  if (/^assets\/.*\.(png|jpe?g|webp|svg)$/i.test(name)) {
    const ext = name.split('.').at(-1).toLowerCase(), hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
    const valid = ext === 'png' ? hex.startsWith('89504e470d0a1a0a') : ['jpg', 'jpeg'].includes(ext) ? hex.startsWith('ffd8ff') : ext === 'webp' ? hex.startsWith('52494646') && hex.slice(16, 24) === '57454250' : /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!valid) throw new Error(`Imagem com tipo inválido: ${name}`);
  } else if (new TextDecoder('utf-8', {fatal: true}).decode(bytes).includes('\u0000')) throw new Error(`Arquivo binário não suportado: ${name}`);
}
export function validPath(name) {
  const parts = name.split('/');
  if (name.length > 240 || name !== name.normalize('NFC') || !roots.includes(parts[0]) || parts.length < 2 || /[\\\u0000-\u001f\u007f:<>"|?*]/.test(name) || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error(`Caminho inseguro: ${name}`);
  return name;
}
export async function safeRead(root, relative, max = MAX_FILE) {
  const resolvedRoot = await realpath(root), file = path.resolve(resolvedRoot, relative);
  if (!file.startsWith(resolvedRoot + path.sep) || (await lstat(file)).isSymbolicLink() || !(await lstat(file)).isFile() || !(await realpath(file)).startsWith(resolvedRoot + path.sep)) throw new Error(`Arquivo fora do projeto ou link: ${relative}`);
  if ((await lstat(file)).size > max) throw new Error(`Arquivo grande demais: ${relative}`);
  const bytes = await readFile(file);
  if (bytes.length > max) throw new Error(`Arquivo grande demais: ${relative}`);
  return bytes;
}
async function tree(root, relative) {
  const folder = path.join(root, relative);
  if (!(await realpath(folder)).startsWith(await realpath(root) + path.sep)) throw new Error(`Pasta fora do projeto: ${relative}`);
  if ((await lstat(folder)).isSymbolicLink()) throw new Error(`Links não são aceitos: ${relative}`);
  const output = Object.create(null), seen = new Set(); let total = 0;
  async function visit(name) {
    for (const entry of await readdir(path.join(folder, name), {withFileTypes: true})) {
      const key = name ? name + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Links não são aceitos: ${key}`);
      if (entry.isDirectory()) {if (!name && !roots.includes(entry.name)) throw new Error(`Pasta fora do tema: ${key}`); await visit(key);}
      else if (entry.isFile()) {
        validPath(key);
        if (seen.has(key.toLowerCase())) throw new Error(`Caminho ambíguo: ${key}`);
        seen.add(key.toLowerCase());
        const bytes = await safeRead(root, relative + '/' + key);
        validateContent(key, bytes);
        if (seen.size > MAX_FILES || (total += bytes.length) > MAX_TOTAL) throw new Error('O tema ultrapassa os limites.');
        output[key] = bytes;
      } else throw new Error(`Entrada não suportada: ${key}`);
    }
  }
  await visit(''); return output;
}
export async function readProject(root) {
  const manifest = JSON.parse(await safeRead(root, '.yampi-sync/manifest.json'));
  if (manifest?.format !== 'yampi-theme-sync' || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES || typeof manifest.capturedAt !== 'string' || !Number.isFinite(Date.parse(manifest.capturedAt)) || typeof manifest.context?.storeName !== 'string' || !manifest.context.storeName.trim()) throw new Error('Manifesto da exportação inválido.');
  for (const origin of [manifest.context.editorOrigin, manifest.context.previewOrigin]) {const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Origem inválida.');}
  const baseline = await tree(root, '.yampi-sync/baseline'), files = await tree(root, 'tema');
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isInteger(item.bytes) || item.bytes < 0 || item.bytes > MAX_FILE || (item.kind !== undefined && !['text', 'image'].includes(item.kind))) throw new Error('Registro do manifesto inválido.');
    validPath(item.path);
    const key = item.path.toLowerCase(), data = baseline[item.path];
    if (seen.has(key) || !data || data.length !== item.bytes || digest(data) !== item.sha256) throw new Error(`Original ausente, duplicado ou alterado: ${item.path}`);
    seen.add(key);
  }
  if (Object.keys(baseline).length !== manifest.files.length) throw new Error('Baseline contém arquivos sem registro.');
  // Reject collisions across original/local versions, even on a case-sensitive filesystem.
  const combined = new Map();
  for (const key of [...Object.keys(baseline), ...Object.keys(files)]) {
    const old = combined.get(key.toLowerCase());
    if (old && old !== key) throw new Error(`Caminho ambíguo: ${key}`);
    combined.set(key.toLowerCase(), key);
  }
  for (const key of combined.values()) for (let i = key.indexOf('/'); i >= 0; i = key.indexOf('/', i + 1)) if (combined.has(key.slice(0, i).toLowerCase())) throw new Error(`Arquivo e pasta em conflito: ${key}`);
  return {manifest, baseline, files};
}
export function textFiles(files) {
  return Object.fromEntries(Object.entries(files).filter(([p]) => /\.(twig|vue|s?css)$/.test(p)).map(([p, b]) => [p, new TextDecoder('utf-8', {fatal: true}).decode(b).replace(/\r\n?/g, '\n')]));
}
export function renderPage(files, template, data, config = {}) {
  validPath(template);
  if (!files[template]) throw new Error(`Template não encontrado: ${template}`);
  const twig = Twig.factory();
  twig.extend(T => {T.Templates.unRegisterLoader('fs'); T.Templates.unRegisterLoader('ajax');});
  const localAsset = value => {
    const name = String(value).replace(/^\/+/, '').replace(/^assets\//, '');
    return '/tema/' + validPath('assets/' + name).split('/').map(encodeURIComponent).join('/');
  };
  const unsupported = name => () => {throw new Error(`Recurso ${name} depende da Yampi. Adapte a prévia local ou seus dados fictícios.`);};
  for (const [name, fn] of Object.entries({assets_url: localAsset, bool_text: v => v ? 'true' : 'false', boolean: v => v === true || v === 'true' || v === 1, json_decode: v => JSON.parse(v), only_numbers: v => String(v).replace(/\D/g, ''), strip_mustache: v => String(v).replace(/\{\{|\}\}/g, ''), font_link: () => '', components_url: unsupported('components_url'), vendor_url: unsupported('vendor_url')})) twig.extendFilter(name, fn);
  twig.extendFunction('get_section_file', (alias, page) => {
    const file = config.sections?.[`${page || data.pageConfig?.page}/${alias}`] || config.sections?.[alias];
    if (!file) throw new Error(`Configure sections[${alias}] em local.config.json.`);
    return validPath(file);
  });
  twig.extendFunction('mix', localAsset);
  twig.extendFunction('generate_seo', () => '');
  for (const [name, content] of Object.entries(files).filter(([p]) => p.endsWith('.twig'))) twig.twig({id: name, data: content, allowInlineIncludes: true, rethrow: true, autoescape: true});
  const output = twig.twig({ref: template}).render(data);
  return String(output);
}
export function compileStyles(files, entries) {
  function resolve(name, from = '') {
    if (/^[a-z]+:/i.test(name) || name.startsWith('/') || name.includes('\\')) throw new Error(`Import Sass fora do tema: ${name}`);
    const relative = path.posix.normalize(path.posix.join(from, name));
    validPath(relative);
    const directory = path.posix.dirname(relative), base = path.posix.basename(relative);
    const candidates = [relative, relative + '.scss', relative + '.css', directory + '/_' + base, directory + '/_' + base + '.scss', relative + '/_index.scss', relative + '/index.scss'];
    const found = candidates.find(p => files[p] !== undefined);
    if (!found) throw new Error(`Import Sass não encontrado: ${relative}`);
    return found;
  }
  const importer = {
    canonicalize(url, {containingUrl}) {
      if (url.startsWith('sass:')) return null;
      const relative = url.startsWith('theme:') ? url.slice(6) : url;
      return new URL('theme:' + resolve(relative, url.startsWith('theme:') ? '' : containingUrl ? path.posix.dirname(containingUrl.pathname) : ''));
    },
    load(url) {return {contents: files[url.pathname], syntax: url.pathname.endsWith('.css') ? 'css' : 'scss'};}
  };
  return entries.map(p => {
    validPath(p);
    if (files[p] === undefined) throw new Error(`Entrada Sass não encontrada: ${p}`);
    return sass.compileString(files[p], {url: new URL('theme:' + p), importers: [importer], logger: sass.Logger.silent}).css;
  }).join('\n');
}
export async function compileComponents(files, root) {
  const components = Object.keys(files).filter(p => p.endsWith('.vue')).sort();
  const scripts = new Map(), css = [];
  const plugin = {name: 'local-vue2', setup(builder) {
    builder.onResolve({filter: /^theme:/}, args => ({path: args.path.slice(6), namespace: 'theme'}));
    builder.onResolve({filter: /^script:/}, args => ({path: args.path.slice(7), namespace: 'script'}));
    builder.onResolve({filter: /^\.\.?\//, namespace: 'script'}, args => {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path));
      validPath(resolved);
      if (!resolved.endsWith('.vue') || files[resolved] === undefined) throw new Error(`Import local não suportado: ${args.path}`);
      return {path: resolved, namespace: 'theme'};
    });
    builder.onLoad({filter: /.*/, namespace: 'script'}, args => ({contents: scripts.get(args.path), loader: 'js', resolveDir: root}));
    builder.onLoad({filter: /.*/, namespace: 'theme'}, args => {
      validPath(args.path);
      const descriptor = compiler.parseComponent(files[args.path]);
      if (descriptor.script?.src || descriptor.template?.src || descriptor.script?.lang || descriptor.template?.lang || descriptor.customBlocks.length) throw new Error(`Bloco Vue não suportado na prévia: ${args.path}`);
      const compiled = compiler.compile(descriptor.template?.content || '<span></span>');
      if (compiled.errors.length) throw new Error(`${args.path}: ${compiled.errors.join('; ')}`);
      scripts.set(args.path, descriptor.script?.content || 'export default {}');
      const scope = 'data-v-' + digest(args.path).slice(0, 8);
      for (const style of descriptor.styles) {
        if (style.src || style.module || (style.lang && !['scss', 'css'].includes(style.lang))) throw new Error(`Estilo Vue não suportado (use CSS/SCSS, sem module/src): ${args.path}`);
        const stylePath = path.posix.dirname(args.path) + '/__vue.scss';
        const compiledStyle = compileStyles({...files, [stylePath]: style.content}, [stylePath]);
        const scoped = compileStyle({source: compiledStyle, filename: args.path, id: scope, scoped: !!style.scoped});
        if (scoped.errors.length) throw new Error(`${args.path}: ${scoped.errors.join('; ')}`);
        css.push(scoped.code);
      }
      return {contents: `import component from ${JSON.stringify('script:' + args.path)}; component.render = new Function(${JSON.stringify(compiled.render)}); component.staticRenderFns = ${JSON.stringify(compiled.staticRenderFns)}.map(code => new Function(code)); ${descriptor.styles.some(s => s.scoped) ? 'component._scopeId = ' + JSON.stringify(scope) + ';' : ''} export default component;`, loader: 'js', resolveDir: root};
    });
  }};
  const entry = `import Vue from 'vue/dist/vue.esm.js';\n${components.map((p, i) => `import C${i} from ${JSON.stringify('theme:' + p)};`).join('\n')}
    Vue.config.productionTip = false;
    const known = new Set();
    ${components.map((p, i) => `{
      const name = C${i}.name || ${JSON.stringify(path.posix.basename(p, '.vue'))};
      if (known.has(name)) throw new Error('Componentes com o mesmo name: ' + name);
      known.add(name); Vue.component(name, C${i});
    }`).join('\n')}
    const data = await (await fetch('/__local/data.json')).json();
    window.merchant = data.merchantData; window.product = data.product; window.Yampi = {local: true};
    Vue.prototype.$formatMoney = value => Number(value).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    Vue.config.errorHandler = (error) => {const notice = document.createElement('pre'); notice.textContent = 'Erro Vue local: ' + error.message; document.body.prepend(notice);};
    const target = document.querySelector('#yampi-local-root');
    if (target) new Vue({el: target});
    document.addEventListener('submit', event => event.preventDefault(), true);
    document.addEventListener('click', event => {const link = event.target.closest('a'); if (link && new URL(link.href).origin !== location.origin) event.preventDefault();}, true);
  `;
  const result = await build({stdin: {contents: entry, resolveDir: root, sourcefile: 'local-entry.js'}, nodePaths: [path.join(root, 'node_modules')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'chrome120', plugins: [plugin], define: {'process.env.NODE_ENV': '"development"'}, logLevel: 'silent'});
  return {js: result.outputFiles[0].text, css: css.join('\n')};
}
