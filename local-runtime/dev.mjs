import http from 'node:http';
import path from 'node:path';
import {readProject, safeRead, textFiles, renderPage, validateMarkup, validPath, compileStyles, compileComponents, digest} from './engine.mjs';
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const types = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css; charset=utf-8'};
export async function loadLocal(root) {
  const config = JSON.parse(await safeRead(root, 'local.config.json'));
  const data = JSON.parse(await safeRead(root, 'local.data.json'));
  if (!config.pages || !Array.isArray(config.styles) || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('local.config.json inválido.');
  const project = await readProject(root), text = textFiles(project.files);
  return {project, text, config, data};
}
export async function validateLocal(root) {
  const {text, config, data} = await loadLocal(root);
  compileStyles(text, config.styles);
  compileStyles(text, config.mobileStyles || []);
  for (const entries of Object.values(config.pageStyles || {})) compileStyles(text, entries);
  for (const entries of Object.values(config.mobilePageStyles || {})) compileStyles(text, entries);
  await compileComponents(text, root);
  for (const [page, template] of Object.entries(config.pages)) validateMarkup(renderPage(text, template, pageData(data, page), config));
  return Object.keys(config.pages).length;
}
export function pageData(data, page) {
  const output = {...data, page, pageConfig: {...data.pageConfig, page}};
  if (data.mainSectionsByPage) output.mainSections = data.mainSectionsByPage[page] || [];
  if (data.sections && !Array.isArray(data.sections)) {output.header = data.header || data.sections.header; output.footer = data.footer || data.sections.footer;}
  if (data.pages?.[page]) Object.assign(output, data.pages[page]);
  return output;
}
export async function createLocalServer(root) {
  const initial = await loadLocal(root);
  let cached;
  async function assets(text, config, page = 'home') {
    const signature = digest(JSON.stringify({text, config, page}));
    if (cached?.signature === signature) return cached;
    const components = await compileComponents(text, root);
    const mobile = [...(config.mobileStyles || []), ...(config.mobilePageStyles?.[page] || [])];
    const css = compileStyles(text, [...config.styles, ...(config.pageStyles?.[page] || [])]) + '\n' + components.css + (mobile.length ? '\n@media (max-width:700px){\n' + compileStyles(text, mobile) + '\n}' : '');
    cached = {signature, js: components.js, css: css.replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, '').replace(/@font-face\s*\{[^}]*\}/gi, '')};
    return cached;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; form-action 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (!['GET', 'HEAD'].includes(req.method) || !/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) {res.writeHead(403).end('Acesso local somente.'); return;}
    const send = (status, type, value) => {res.writeHead(status, {'Content-Type': type}).end(req.method === 'HEAD' ? undefined : value);};
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const {project, text, config, data} = await loadLocal(root);
      if (url.pathname === '/__local/data.json') {send(200, 'application/json', JSON.stringify(pageData(data, url.searchParams.get('page') || 'home'))); return;}
      if (url.pathname === '/__local/empty.css' || url.pathname === '/__local/empty.js') {send(200, url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', ''); return;}
      if (url.pathname === '/__local/placeholder.svg') {send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="#e8e8e8"/><text x="320" y="205" text-anchor="middle" fill="#666" font-size="24" font-family="sans-serif">Imagem fictícia · prévia local</text></svg>'); return;}
      if (url.pathname === '/__local/app.js' || url.pathname === '/__local/style.css') {
        const built = await assets(text, config, url.searchParams.get('page') || 'home');
        send(200, url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', url.pathname.endsWith('.js') ? built.js : built.css); return;
      }
      if (url.pathname.startsWith('/tema/assets/')) {
        const name = validPath(decodeURIComponent(url.pathname.slice(6)));
        const type = types[name.split('.').at(-1)?.toLowerCase()];
        if (!type || !project.files[name]) {
          if (/^assets\/.*\.(svg|png|jpe?g|webp)$/i.test(name) && !name.includes('..')) {send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="4" fill="#ddd"/></svg>'); return;}
          send(404, 'text/plain', 'Asset não encontrado.'); return;
        }
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
        send(200, type, project.files[name]); return;
      }
      if (url.pathname === '/preview') {
        const page = url.searchParams.get('page') || 'home', template = config.pages[page];
        if (typeof template !== 'string') {send(404, 'text/plain', 'Página não configurada.'); return;}
        await assets(text, config, page);
        let html = renderPage(text, template, pageData(data, page), config);
        // Remove meta refresh and base redirects. Browser CSP blocks remote scripts, fetch and forms.
        html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
        // Remote/platform scripts are not part of the portable application.
        // Vue executes only the compiled bundle. Keep inline CSS from the theme.
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*\b(?:rel=["'](?:preload|prefetch|manifest)["']|href=["'](?:https?:)?\/\/)[^>]*>/gi, '');
        html = html.replace(/(?:src|data-src)=["'](?:https?:)?\/\/[^"']*["']/gi, 'src="/__local/placeholder.svg"');
        html = html.replace(/\/__local\/style\.css/g, '/__local/style.css?page=' + encodeURIComponent(page));
        validateMarkup(html);
        const head = '<link rel="stylesheet" href="/__local/style.css?page=' + encodeURIComponent(page) + '"><style>#yampi-local-notice{font:14px system-ui;background:#fff3d6;color:#453817;padding:12px;position:sticky;top:0;z-index:99999}#yampi-local-notice[data-error="true"]{background:#fce9e5;color:#a52f18}</style>';
        const tail = '<script type="module" src="/__local/app.js"></script>';
        if (/<body\b/i.test(html)) html = html.replace(/(<body\b[^>]*>)/i, '$1<div id="yampi-local-root">').replace(/<\/body>/i, '</div>' + tail + '</body>');
        else html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' + head + '</head><body><div id="yampi-local-root">' + html + '</div>' + tail + '</body></html>';
        if (!html.includes(head)) html = html.replace(/<\/head>/i, head + '</head>');
        send(200, 'text/html; charset=utf-8', html); return;
      }
      if (url.pathname !== '/') {send(404, 'text/plain', 'Rota local não encontrada.'); return;}
      const links = Object.keys(config.pages).map(page => `<li><a href="/preview?page=${encodeURIComponent(page)}">${escape(page)}</a></li>`).join('');
      send(200, 'text/html; charset=utf-8', `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Prévia local do tema</title><style>body{font:16px system-ui;max-width:820px;margin:60px auto;padding:24px;color:#20372e}a{color:#20634f}li{margin:16px 0}code{background:#eef2ed;padding:3px 5px}</style><h1>Prévia local do tema</h1><p>Abra uma página, edite em <code>tema/</code> e recarregue para conferir. Dados fictícios; serviços da loja indisponíveis nesta prévia.</p><ul>${links || '<li>Configure as páginas em local.config.json.</li>'}</ul><p>Use <code>npm run pack</code> para gerar o ZIP de retorno e importe-o na extensão.</p><p>Compatibilidade parcial com Twig e Vue 2. Confira a prévia da Yampi antes de publicar.</p></html>`);
    } catch (error) {send(422, 'text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><h1>Não foi possível montar a prévia</h1><pre>' + escape(error.message) + '</pre><p>Corrija o arquivo ou adapte os dados em local.data.json e as entradas em local.config.json.</p>');}
  });
  return {server, port: initial.config.port};
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const root = path.resolve(import.meta.dirname, '../..');
  try {
    if (process.argv.includes('--check')) console.log(`Original íntegro; ${await validateLocal(root)} páginas compiladas com dados fictícios.`);
    else {
      const {server, port} = await createLocalServer(root);
      server.on('error', error => {console.error(error.message); process.exitCode = 1;});
      server.listen(port, '127.0.0.1', () => console.log(`Prévia local: http://127.0.0.1:${port}. Edite tema/ e recarregue a página.`));
    }
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
