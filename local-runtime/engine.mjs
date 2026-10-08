import path from 'node:path';
import {readdir, readFile, lstat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSynchronousEnvironment, createSynchronousArrayLoader, createSynchronousFilter, createSynchronousFunction} from './twig.mjs';
import {twigHelpers} from './platform.mjs';
import * as sass from 'sass';
import compiler from 'vue-template-compiler';
import {compileStyle, compileTemplate} from 'vue/compiler-sfc';
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
  const localAsset = value => {
    const name = String(value).replace(/^\/+/, '').replace(/^assets\//, '');
    return '/tema/' + validPath('assets/' + name).split('/').map(encodeURIComponent).join('/');
  };
  const unsupported = name => () => {throw new Error(`Recurso ${name} depende da Yampi. Adapte a prévia local ou seus dados fictícios.`);};
  // Memory-only loader: no filesystem or network template loaders exist here.
  const templates = Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith('.twig')));
  templates['yampi-internals/head.twig'] ??= '<!-- Serviços internos ausentes na prévia local -->';
  templates['yampi-internals/services/chat.twig'] ??= '<!-- Chat não é executado na prévia local -->';
  const twig = createSynchronousEnvironment(createSynchronousArrayLoader(templates), {autoEscapingStrategy: 'html'});
  const {filters, functions} = twigHelpers(localAsset);
  function register(kind, name, fn) {
    const args = Array.from({length: fn.length}, (_, i) => ({name: 'arg' + i, defaultValue: null}));
    const wrapper = (context, ...values) => fn(...values);
    if (kind === 'filter') twig.addFilter(createSynchronousFilter(name, wrapper, args.slice(1), {is_variadic: true}));
    else twig.addFunction(createSynchronousFunction(name, wrapper, args, {is_variadic: true}));
  }
  for (const [name, fn] of Object.entries({...filters, assets_url: localAsset, vendor_url: unsupported('vendor_url')})) register('filter', name, fn);
  for (const [name, fn] of Object.entries(functions)) register('function', name, fn);
  register('function', 'get_section_file', (alias, page) => {
    const file = config.sections?.[`${page || data.pageConfig?.page}/${alias}`] || config.sections?.[alias];
    if (!file) throw new Error(`Configure sections[${alias}] em local.config.json.`);
    return validPath(file);
  });
  register('function', 'mix', localAsset);
  register('function', 'generate_seo', () => '<title>Prévia local</title>');
  const output = twig.render(template, data);
  return String(output);
}
export function validateMarkup(html) {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] || html;
  const source = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const result = compiler.compile('<div>' + source + '</div>');
  if (result.errors.length) throw new Error('HTML/Vue da página inválido: ' + result.errors.join('; '));
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
    // The platform normally supplies this variable; keep exported source intact.
    const content = p.endsWith('.scss') ? '$assets: "/tema/assets" !default;\n' + files[p] : files[p];
    return sass.compileString(content, {url: new URL('theme:' + p), importers: [importer], logger: sass.Logger.silent}).css;
  }).join('\n');
}
export async function compileComponents(files, root) {
  const components = Object.keys(files).filter(p => p.endsWith('.vue')).sort();
  const platformFile = path.join(import.meta.dirname, 'platform-browser.mjs');
  const scripts = new Map(), css = [];
  css.push(await readFile(path.join(root, 'node_modules/@splidejs/splide/dist/css/splide.min.css'), 'utf8'));
  const plugin = {name: 'local-vue2', setup(builder) {
    // The portable project and the test harness must share one Vue/Vuex instance.
    // Resolve runtime packages from the project's installation, including imports
    // made by this tool file when it lives outside that project during a test.
    builder.onResolve({filter: /^(vue(?:\/.*)?|vuex|lodash|js-cookie|@splidejs\/splide)$/}, args => {
      if (args.pluginData === 'local-package') return;
      return builder.resolve(args.path, {resolveDir: root, kind: args.kind, pluginData: 'local-package'});
    });
    builder.onResolve({filter: /^theme:/}, args => ({path: args.path.slice(6), namespace: 'theme'}));
    builder.onResolve({filter: /^script:/}, args => ({path: args.path.slice(7), namespace: 'script'}));
    builder.onResolve({filter: /^@\/components\//, namespace: 'script'}, args => {
      const resolved = args.path.slice(2); validPath(resolved);
      if (!resolved.endsWith('.vue') || files[resolved] === undefined) throw new Error(`Componente não exportado: ${args.path}`);
      return {path: resolved, namespace: 'theme'};
    });
    builder.onResolve({filter: /^~\//, namespace: 'script'}, async args => {
      const name = args.path.slice(2), packages = {vue: 'vue/dist/vue.esm.js', vuex: 'vuex', lodash: 'lodash', 'js-cookie': 'js-cookie'};
      if (packages[name]) return builder.resolve(packages[name], {resolveDir: root, kind: args.kind});
      if (['external-svg-loader', 'vue-debounce'].includes(name)) return {path: name, namespace: 'platform'};
      throw new Error(`Biblioteca da plataforma não simulada: ${args.path}`);
    });
    builder.onResolve({filter: /^@\/(mixins|modules)\//, namespace: 'script'}, args => ({path: args.path.slice(2), namespace: 'platform'}));
    builder.onLoad({filter: /.*/, namespace: 'platform'}, args => {
      const header = `import * as local from ${JSON.stringify(platformFile)};`;
      let content;
      if (/^mixins\/(mobile|merchant|product|productCardTheme|prices|helpers|buttons|cache|cashback|errors|queryParams|touchable)$/.test(args.path)) content = `export default local.mixins[${JSON.stringify(args.path.slice(7))}]; export const uuidv4 = local.uuidv4, getImageMeta = local.getImageMeta, debounce = local.debounce, smoothScroll = local.smoothScroll, createPriceObjects = local.createPriceObjects, isLinkSameStoreDomain = local.isLinkSameStoreDomain;`;
      else if (/^modules\/axios\/(api|rocket|search)$/.test(args.path)) content = 'export default local.client;';
      else if (args.path === 'modules/eventBus') content = 'export default local.eventBus;';
      else if (args.path === 'modules/SearchAttributesHandler') content = 'export default local.SearchAttributesHandler;';
      else if (args.path === 'modules/search/searchHelpers') content = 'export const builderSearch = local.builderSearch, urlSearch = local.urlSearch;';
      else if (['external-svg-loader', 'vue-debounce'].includes(args.path)) content = 'export default {};';
      else throw new Error(`Módulo da plataforma não simulado: @/${args.path}`);
      return {contents: header + content, loader: 'js', resolveDir: root};
    });
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
      const functional = descriptor.template?.attrs.functional !== undefined;
      const compiled = compileTemplate({source: descriptor.template?.content || '<span></span>', filename: args.path, compiler, isFunctional: functional});
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
      return {contents: `import component from ${JSON.stringify('script:' + args.path)}; ${compiled.code}\ncomponent.render = render; component.staticRenderFns = staticRenderFns; component._compiled = true; ${functional ? 'component.functional = true;' : ''} ${descriptor.styles.some(s => s.scoped) ? 'component._scopeId = ' + JSON.stringify(scope) + ';' : ''} export default component;`, loader: 'js', resolveDir: root};
    });
  }};
  const entry = `import Vue from 'vue/dist/vue.esm.js';
    import {setup, report} from ${JSON.stringify(platformFile)};
    const data = await (await fetch('/__local/data.json' + location.search)).json();
    const store = setup(data);
    ${components.map((p, i) => `const C${i} = (await import(${JSON.stringify('theme:' + p)})).default;`).join('\n')}
    const known = new Set();
    ${components.map((p, i) => `{
      const filename = ${JSON.stringify(path.posix.basename(p, '.vue'))};
      const name = C${i}.name || filename;
      Vue.component(filename, C${i});
      if (!known.has(name)) {known.add(name); Vue.component(name, C${i});}
      else if (name !== filename) console.warn('Alias Vue duplicado: ' + name + '; use o nome do arquivo.');
    }`).join('\n')}
    const target = document.querySelector('#yampi-local-root');
    if (target) {window.__yampiLocalApp = new Vue({el: target, store}); window.__yampiLocalReady = !(window.__yampiLocalMessages || []).some(m => m.error);}
    else report('Raiz da prévia não encontrada.', true);
  `;
  const result = await build({stdin: {contents: entry, resolveDir: root, sourcefile: 'local-entry.js'}, nodePaths: [path.join(root, 'node_modules')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'chrome120', plugins: [plugin], define: {'process.env.NODE_ENV': '"development"'}, logLevel: 'silent'});
  return {js: result.outputFiles[0].text, css: css.join('\n')};
}
