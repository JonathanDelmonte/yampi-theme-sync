import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp, mkdir, writeFile, readFile, cp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {unzipSync, zipSync, strToU8} from 'fflate';
import {createLocalServer} from '../local-runtime/dev.mjs';
const repository = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'yampi-e2e-ficticio-'));
let browser, localServer;
async function command(cmd, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {cwd, stdio: 'pipe'}); let log = '';
    child.stdout.on('data', b => {log += b;}); child.stderr.on('data', b => {log += b;});
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd}: ${log}`)));
  });
}
try {
  const extension = path.join(temporary, 'extension'), project = path.join(temporary, 'project');
  await mkdir(extension); await mkdir(project);
  for (const file of ['manifest.json', 'background.js', 'bridge.js', 'panel.js', 'panel.html', 'panel.css']) await cp(path.join(repository, 'dist', file), path.join(extension, file));
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  // Test-only permission. Every HTTP request to this origin is fulfilled below by the fixture; nothing reaches Yampi.
  manifest.host_permissions = ['https://app.yampi.com.br/*'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  browser = await chromium.launchPersistentContext(path.join(temporary, 'browser'), {channel: 'chromium', headless: true, acceptDownloads: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]});
  browser.setDefaultTimeout(30000);
  console.log('E2E: Chromium e extensão iniciados.');
  const html = (await readFile(path.join(repository, 'dist/fixture.html'), 'utf8')).replace('<script src="bridge.js"></script>', '');
  const fixtureJs = await readFile(path.join(repository, 'dist/fixture.js'));
  await browser.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.origin === 'https://app.yampi.com.br' && /^\/store\/code-editor\/?$/.test(url.pathname)) return route.fulfill({contentType: 'text/html', body: html});
    if (url.origin === 'https://app.yampi.com.br' && ['/store/code-editor/fixture.js', '/store/fixture.js'].includes(url.pathname)) return route.fulfill({contentType: 'text/javascript', body: fixtureJs});
    if (url.origin === 'http://127.0.0.1:5182') return route.continue();
    return route.abort();
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const extensionId = worker.url().split('/')[2];
  const editor = await browser.newPage(); await editor.goto('https://app.yampi.com.br/store/code-editor/');
  await editor.locator('#test-info').waitFor();
  const session = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({url: 'https://app.yampi.com.br/store/code-editor/'});
    const token = crypto.randomUUID();
    const panel = await chrome.tabs.create({url: chrome.runtime.getURL('panel.html')});
    await chrome.storage.session.set({[token]: {tabId: tab.id, editorUrl: tab.url, panelId: panel.id, locked: false}});
    return {token, panelId: panel.id};
  });
  const panel = await browser.newPage();
  // Bind the actual created panel tab, just like the action handler; a different tab would be rejected.
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  await worker.evaluate(async s => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.filter(t => t.url === chrome.runtime.getURL('panel.html')).at(-1);
    const value = (await chrome.storage.session.get(s.token))[s.token];
    value.panelId = tab.id; await chrome.storage.session.set({[s.token]: value});
  }, session);
  await panel.goto(`chrome-extension://${extensionId}/panel.html?session=${session.token}`);
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Editor conectado');
  console.log('E2E: worker conectado ao editor fictício.');
  const exported = panel.waitForEvent('download'); await panel.locator('#export').click();
  const download = await exported, exportPath = path.join(temporary, 'export.zip'); await download.saveAs(exportPath);
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Projeto local exportado');
  console.log('E2E: exportação com PNG e texto integral conferida.');
  const entries = unzipSync(new Uint8Array(await readFile(exportPath)));
  assert.equal(Object.keys(entries).filter(p => p.startsWith('tema/')).length, 9);
  assert.ok(new TextDecoder().decode(entries['tema/templates/long.twig']).includes('Linha 2000'));
  assert.ok(entries['tema/assets/images/example.png'].length > 0);
  for (const [name, bytes] of Object.entries(entries)) {await mkdir(path.dirname(path.join(project, name)), {recursive: true}); await writeFile(path.join(project, name), bytes);}
  const npmCli = process.platform === 'win32' ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : process.env.npm_execpath;
  assert.ok(npmCli, 'Execute via npm run test:e2e.');
  await command(process.execPath, [npmCli, 'ci'], project);
  await command(process.execPath, [path.join(project, '.yampi-sync/tools/dev.mjs'), '--check'], project);
  console.log('E2E: projeto exportado instalado e compilado.');
  const local = await createLocalServer(project); localServer = local.server;
  await new Promise((resolve, reject) => {localServer.once('error', reject); localServer.listen(5182, '127.0.0.1', resolve);});
  const preview = await browser.newPage(); await preview.goto('http://127.0.0.1:5182/preview?page=home');
  await preview.waitForFunction(() => document.querySelector('button')?.textContent?.includes('Clique para testar'));
  await preview.locator('button').click(); assert.match(await preview.locator('button').textContent(), /1/);
  assert.equal(await preview.locator('button').evaluate(button => getComputedStyle(button).borderTopColor), 'rgb(32, 99, 79)');
  assert.equal(await preview.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  console.log('E2E: Vue interativo e PNG local conferidos.');
  await writeFile(path.join(project, 'tema/elements/head.twig'), '<meta name="description" content="Editado localmente">\n');
  await writeFile(path.join(project, 'tema/templates/new.twig'), '<p>Arquivo novo bloqueado</p>\n');
  await command(process.execPath, [path.join(project, '.yampi-sync/tools/pack.mjs')], project);
  const folderImport = path.join(temporary, 'folder-import');
  await mkdir(folderImport);
  for (const relative of ['tema', '.yampi-sync']) await cp(path.join(project, relative), path.join(folderImport, relative), {recursive: true});
  await mkdir(path.join(folderImport, 'node_modules'), {recursive: true});
  await writeFile(path.join(folderImport, 'node_modules/ignored.txt'), 'Dependência fictícia não enviada');
  await panel.bringToFront();
  await panel.waitForFunction(() => !document.querySelector('#folder').disabled);
  await panel.locator('#folder').setInputFiles(folderImport, {timeout: 15000});
  console.log('E2E: pasta selecionada.');
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Pasta local carregada');
  assert.match(await panel.locator('#local-info').textContent(), /9 textos e 1 imagens/);
  await panel.locator('#baseline').setInputFiles(path.join(project, 'retorno-yampi.zip'));
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Projeto ZIP carregado');
  await panel.locator('#compare').click();
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Comparação concluída');
  assert.match(await panel.locator('#summary').textContent(), /1 prontos/);
  assert.match(await panel.locator('#rows').textContent(), /Novo arquivo · bloqueado/);
  await panel.locator('#confirm-store').fill('Loja de testes');
  const backup = panel.waitForEvent('download'); await panel.locator('#apply').click(); await (await backup).saveAs(path.join(temporary, 'backup.zip'));
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Arquivos salvos e conferidos após recarregar');
  console.log('E2E: envio, backup e reload conferidos.');
  assert.match(await editor.locator('#test-info').textContent(), /Publicações: 0/);
  assert.equal(await editor.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-files'))['elements/head.twig']), '<meta name="description" content="Editado localmente">\n');
  await panel.reload(); await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Editor conectado');
  assert.match(await panel.locator('#journal-info').textContent(), /1\/1/);
  await panel.locator('#restore').click(); await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Restauração preparada para revisão');
  assert.match(await panel.locator('#summary').textContent(), /1 prontos/);
  // A remote edit after the send must be protected during restore.
  await editor.locator('#remote-file').selectOption('elements/head.twig'); await editor.locator('#external-change').click();
  await panel.locator('#restore').click(); await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Restauração preparada para revisão');
  assert.match(await panel.locator('#summary').textContent(), /1 conflitos/);
  console.log('E2E: conflito na restauração protegido.');
  // Importing a folder never consumes node_modules/config/tools as store files.
  const corrupted = {...entries, '.yampi-sync/baseline/templates/home.twig': strToU8('alterado')};
  await writeFile(path.join(temporary, 'corrupted.zip'), zipSync(corrupted));
  await panel.locator('#baseline').setInputFiles(path.join(temporary, 'corrupted.zip'));
  await panel.waitForFunction(() => document.querySelector('#status').textContent === 'Operação interrompida');
  assert.match(await panel.locator('#detail').textContent(), /Baseline/);
  await mkdir(path.join(repository, '.cache'), {recursive: true});
  await panel.screenshot({path: path.join(repository, '.cache/panel-e2e.png'), fullPage: true});
  await preview.screenshot({path: path.join(repository, '.cache/local-preview-e2e.png'), fullPage: true});
  console.log('E2E aprovado: extensão MV3 + worker + editor fictício, exportação integral, PNG, projeto portátil com npm ci, Twig/Sass/Vue 2 interativo, ZIP de retorno, envio com backup/reload, histórico, conflito na restauração e importação da pasta inteira. Nenhuma requisição alcançou a Yampi.');
} catch (error) {
  await mkdir(path.join(repository, '.cache'), {recursive: true});
  if (browser) for (const page of browser.pages()) if (page.url().includes('panel.html?session=')) {
    await page.screenshot({path: path.join(repository, '.cache/panel-e2e-error.png'), fullPage: true}).catch(() => {});
    console.error('Estado do painel:', await page.locator('#status').textContent().catch(() => ''), await page.locator('#detail').textContent().catch(() => ''));
    console.error('Seletor de pasta:', await page.locator('#folder').evaluate(input => ({disabled: input.disabled, count: input.files.length, paths: [...input.files].map(f => f.webkitRelativePath)})).catch(() => ''));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (localServer) await new Promise(resolve => localServer.close(resolve));
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep + 'yampi-e2e-ficticio-')) throw new Error('Destino de limpeza inválido.');
  await rm(temporary, {recursive: true, force: true});
}
