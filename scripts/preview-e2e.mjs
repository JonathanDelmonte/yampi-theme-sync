import assert from 'node:assert/strict';
import {build,stop} from 'esbuild';
import {chromium} from 'playwright';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {unzipSync} from 'fflate';
const repository=path.resolve(import.meta.dirname,'..'),temporary=await mkdtemp(path.join(os.tmpdir(),'yampi-preview-ficticio-'));
const evidence=path.join(repository,'.cache/visual-validation');await mkdir(evidence,{recursive:true});
let browser,harnessServer,localServer;const buildStops=[];
const raw={name:'raw',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:path.resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}};
function command(args,cwd) {
  return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...args],{cwd,stdio:'pipe'});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(log):reject(new Error(log)));});
}
async function extract(bytes,destination){await mkdir(destination);for(const [p,b] of Object.entries(unzipSync(bytes))){const target=path.resolve(destination,p);assert.ok(target.startsWith(destination+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,b);}}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
async function visualComparison(context,actual,referenceHtml,filename) {
  const reference=await context.newPage();await reference.setContent(referenceHtml);await reference.evaluate(()=>document.fonts.ready);await reference.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  const ref=await reference.locator('#store').screenshot(),local=await actual.locator('#store').screenshot();
  await writeFile(path.join(evidence,filename+'-reference.png'),ref);await writeFile(path.join(evidence,filename+'-local.png'),local);
  const difference=await reference.evaluate(async({a,b})=>{
    const load=async data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return createImageBitmap(new Blob([bytes],{type:'image/png'}));};
    const x=await load(a),y=await load(b);if(x.width!==y.width||x.height!==y.height)return {dimensions:false,ratio:1};
    const pixels=bitmap=>{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const p=pixels(x),q=pixels(y);let bad=0;for(let i=0;i<p.length;i+=4)if(Math.max(Math.abs(p[i]-q[i]),Math.abs(p[i+1]-q[i+1]),Math.abs(p[i+2]-q[i+2]))>8)bad++;
    return {dimensions:true,ratio:bad/(p.length/4)};
  },{a:ref.toString('base64'),b:local.toString('base64')});
  assert.equal(difference.dimensions,true,'Dimensões visuais distintas');assert.ok(difference.ratio<0.01,'Diferença visual acima de 1%: '+JSON.stringify(difference));await reference.close();return difference;
}
function referenceHTML(fixture) {
  const {expected:e,snapshot:s}=fixture,cdn='https://'+e.tone+'-cdn.invalid';
  const fontCSS=fixture.resources[cdn+'/fonts.css'].text.replace(/url\('display.woff2'\)/g,`url('${cdn}/display.woff2')`);
  return `<!doctype html><html><head><style>${fontCSS}\n${s.files['assets/styles/global/main.scss']}\n:root{--bg:${e.background};--ink:${e.ink};--accent:${e.accent};--display:'${e.font}'} .custom-button{background:${e.buttonBackground};font-weight:700}.custom-button{color:${e.ink};border:2px solid ${e.accent};letter-spacing:2px}</style></head><body><main id="store"><header><img id="logo" src="${cdn}/logo.svg" alt="Logo"><h1>${e.title}</h1><nav>${e.categories.map(c=>`<a class="category-link" href="${c.url_path}">${c.name}</a>`).join('')}</nav><i class="icon">&#xe001;</i></header><h2 id="page-title">${e.tone==='dark'?'Noite de teste':'Manhã de teste'}</h2><img id="banner" src="${cdn}/banner.svg" alt="Banner"><button class="custom-button">Botão fictício</button><section id="catalog"><span class="search-state">${e.tone==='dark'?'new-search':'classic-search'}</span><span class="price-state">priced</span><span class="filter-state">1</span><span class="sample-state">1</span><span class="cache-state">160x120</span><div class="cards">${e.products.map(p=>`<a class="product-link" href="${p.url_path}"><span class="custom-image"><img src="${p.images.data[0].url}" alt="${p.name}"></span><b>${p.name}</b><span>${p.prices.data.price_formated}</span></a>`).join('')}</div></section><footer>Exemplo inteiramente fictício</footer></main></body></html>`;
}
try {
  const harness=await build({entryPoints:[path.join(repository,'tests/fixtures/visual-harness.ts')],bundle:true,format:'iife',globalName:'VisualHarness',write:false,plugins:[raw],target:'chrome120'});
  harnessServer=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/harness.js'?'text/javascript':'text/html');res.end(req.url==='/harness.js'?harness.outputFiles[0].text:'<!doctype html><script src="/harness.js"></script>');});await new Promise(r=>harnessServer.listen(0,'127.0.0.1',r));
  const harnessOrigin='http://127.0.0.1:'+harnessServer.address().port;
  browser=await chromium.launch({headless:true});const captureContext=await browser.newContext();const capturePage=await captureContext.newPage();await capturePage.goto(harnessOrigin);
  const fixtures={dark:await capturePage.evaluate(()=>VisualHarness.visualStore('dark')),light:await capturePage.evaluate(()=>VisualHarness.visualStore('light'))};
  const network=[];
  await captureContext.route('https://**/*',async route=>{const url=route.request().url(),resource=fixtures.dark.resources[url]||fixtures.light.resources[url];assert.ok(resource,'URL externa inesperada: '+url);assert.equal(route.request().method(),'GET');assert.equal(route.request().headers()['cookie'],undefined);network.push(url);await route.fulfill({contentType:resource.type,body:resource.base64?Buffer.from(resource.base64,'base64'):resource.text,headers:{'Access-Control-Allow-Origin':'*'}});});
  const captures={dark:await capturePage.evaluate(()=>VisualHarness.capture('dark')),light:await capturePage.evaluate(()=>VisualHarness.capture('light'))};
  await captureContext.close();await new Promise(r=>harnessServer.close(r));harnessServer=null;
  const summary=[];
  for(const tone of ['dark','light']) {
    const captured=captures[tone],fixture=fixtures[tone],source=path.join(temporary,tone+'-source'),moved=path.join(temporary,tone+'-moved');
    assert.equal(captured.source.association,'published-unverified');assert.equal(captured.pages.length,5);assert.equal(captured.resources.length,6);assert.deepEqual(captured.issues.map(i=>i.code),['published-association']);
    await extract(Buffer.from(captured.zip,'base64'),source);
    // Move the entire ZIP project before installing dependencies. The exporter,
    // network cache and original extraction directory are unavailable thereafter.
    await cp(source,moved,{recursive:true});assert.ok(source.startsWith(temporary+path.sep));await rm(source,{recursive:true});
    console.log('Prévia '+tone+': npm ci e checks no projeto movido, usando apenas ferramentas do ZIP.');
    await command(['ci','--ignore-scripts','--no-audit','--no-fund'],moved);
    const integrity=await command(['run','check:integrity'],moved);assert.match(integrity,/'?published-unverified'?/);
    await command(['run','check'],moved);await command(['run','pack'],moved);
    const returned=unzipSync(new Uint8Array(await readFile(path.join(moved,'retorno-yampi.zip'))));assert.ok(Object.keys(returned).every(p=>p.startsWith('tema/')||p.startsWith('.yampi-sync/baseline/')||p==='.yampi-sync/manifest.json'));
    for(const [p,text] of Object.entries(fixture.snapshot.files)){assert.equal(Buffer.from(returned['tema/'+p]).toString(),text);assert.equal(Buffer.from(returned['.yampi-sync/baseline/'+p]).toString(),text);}
    const {createLocalServer}=await import(pathToFileURL(path.join(moved,'.yampi-sync/tools/dev.mjs')));const compiler=await import(pathToFileURL(path.join(moved,'node_modules/esbuild/lib/main.js')));buildStops.push(compiler.stop||compiler.default.stop);const local=await createLocalServer(moved);localServer=local.server;await new Promise(r=>localServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+localServer.address().port;
    const context=await browser.newContext(),actual=await context.newPage(),foreign=[],errors=[];
    await context.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();foreign.push(route.request().url());return route.abort();});
    actual.on('pageerror',e=>errors.push(e.message));actual.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await actual.goto(base+'/preview?page=home');await actual.waitForFunction(()=>window.__yampiLocalReady===true);await actual.locator('.cache-state').filter({hasText:'160x120'}).waitFor();await actual.evaluate(()=>document.fonts.ready);
    const measurements=await actual.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color,button:getComputedStyle(document.querySelector('button')).backgroundColor,weight:getComputedStyle(document.querySelector('button')).fontWeight,spacing:getComputedStyle(document.querySelector('button')).letterSpacing,font:getComputedStyle(document.querySelector('h1')).fontFamily,fontLoaded:document.fonts.check('16px '+getComputedStyle(document.querySelector('h1')).fontFamily),iconLoaded:document.fonts.check('16px FixtureIcons'),fontFaces:[...document.fonts].map(f=>({family:f.family,status:f.status})),images:[...document.images].map(i=>({src:i.currentSrc,width:i.naturalWidth,height:i.naturalHeight})),loading:document.querySelectorAll('.-loading').length,messages:window.__yampiLocalMessages||[]}));
    await writeFile(path.join(evidence,tone+'-rendered.html'),await actual.content());await writeFile(path.join(evidence,tone+'-compiled.css'),await (await fetch(base+'/__local/style.css')).text());await writeFile(path.join(evidence,tone+'-measurements.json'),JSON.stringify({measurements,errors,foreign},null,2));
    const e=captured.expected;assert.equal(measurements.body,'rgb('+rgb(e.background).join(', ')+')');assert.equal(measurements.ink,'rgb('+rgb(e.ink).join(', ')+')');assert.equal(measurements.button,tone==='dark'?'rgba(0, 0, 0, 0)':'rgb('+rgb(e.accent).join(', ')+')');assert.equal(measurements.weight,'700');assert.equal(measurements.spacing,'2px');assert.equal(measurements.font,e.font);assert.equal(measurements.fontLoaded,true);assert.equal(measurements.iconLoaded,true);assert.ok(measurements.fontFaces.length>=2);assert.ok(measurements.fontFaces.every(f=>f.status==='loaded'));assert.equal(measurements.loading,0);assert.ok(measurements.images.every(i=>i.src.includes('/preview/assets/')&&i.width>0&&i.height>0));assert.deepEqual(measurements.messages,[]);assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);
    assert.equal(await actual.locator('.filter-state').textContent(),'1');assert.equal(await actual.locator('.sample-state').textContent(),'1');assert.equal(await actual.locator('.search-state').textContent(),tone==='dark'?'new-search':'classic-search');
    const filters=await actual.evaluate(()=>window.__yampiLocalApp.$store.state.filters.searchFilters);assert.deepEqual(filters.priceRange,{min:35,max:95,source:'captured-sample'});assert.equal(filters.categories.length,2);assert.equal(filters.attributes.length,1);
    const variants=await actual.evaluate(async()=>{const vm=window.__yampiLocalApp.$children.find(c=>c.$options.name==='FixtureCatalog');const original=vm.selectedSku;vm.setSelectedSku({id:99,price_sale:80,price_formated:'R$ 80,00'});await vm.$nextTick();const selected=vm.selectedPrice;vm.setSelectedSku(original);await vm.$nextTick();return {selected,restored:vm.selectedPrice};});assert.equal(variants.selected,'R$ 80,00');assert.match(variants.restored,/35,00/);
    const productLinks=await actual.locator('.product-link').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),categoryLinks=await actual.locator('.category-link').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));assert.equal(new Set(productLinks).size,2);assert.equal(new Set(categoryLinks).size,2);
    for(let i=0;i<2;i++){await actual.goto(base+'/preview?page=home');await actual.waitForFunction(()=>window.__yampiLocalReady);await actual.locator('.product-link').nth(i).click();await actual.waitForURL(base+productLinks[i]);await actual.waitForFunction(()=>window.__yampiLocalReady);assert.equal(await actual.locator('#page-title').textContent(),e.products[i].name);await actual.goto(base+'/preview?page=home');await actual.waitForFunction(()=>window.__yampiLocalReady);await actual.locator('.category-link').nth(i).click();await actual.waitForURL(base+categoryLinks[i]);await actual.waitForFunction(()=>window.__yampiLocalReady);assert.equal(await actual.locator('#page-title').textContent(),e.categories[i].name);}
    const visuals=[];
    // Use a distinct reference context for each viewport; its synthetic network
    // is isolated from the offline local page under test.
    for(const [name,viewport] of [['desktop',{width:1200,height:900}],['mobile',{width:390,height:844}]]) {
      await actual.setViewportSize(viewport);await actual.goto(base+'/preview?page=home');await actual.locator('.cache-state').filter({hasText:'160x120'}).waitFor();await actual.evaluate(()=>document.fonts.ready);
      const refContext=await browser.newContext({viewport});await refContext.route('https://**/*',async route=>{const resource=fixture.resources[route.request().url()];assert.ok(resource);return route.fulfill({contentType:resource.type,body:resource.base64?Buffer.from(resource.base64,'base64'):resource.text});});
      visuals.push({viewport:name,...await visualComparison(refContext,actual,referenceHTML(fixture),tone+'-'+name)});await refContext.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);await context.close();await new Promise(r=>localServer.close(r));localServer=null;
    summary.push({store:e.title,source:captured.source,pages:captured.pages.length,assets:captured.resources.length,portable:true,integrity:true,returnExcludesPreview:true,offline:true,measurements,visuals});
    console.log('Prévia '+tone+': identidade, CSS, fontes, imagens/cache, filtros, rotas distintas e comparação visual passaram.');
  }
  await writeFile(path.join(evidence,'report.json'),JSON.stringify({fictionalOnly:true,realStoreVisualValidation:false,networkRequests:network.length,stores:summary},null,2));console.log('Duas lojas fictícias validadas. Evidências em .cache/visual-validation/. Nenhuma certificação visual de loja real.');
} catch(error) {console.error('Falha na validação visual:',error);throw error;
} finally {
  await browser?.close();if(harnessServer)await new Promise(r=>harnessServer.close(r));if(localServer)await new Promise(r=>localServer.close(r));
  stop();for(const finish of buildStops)finish();
  assert.ok(temporary.startsWith(path.resolve(os.tmpdir())+path.sep+'yampi-preview-ficticio-'));await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(error=>console.error('Pasta fictícia preservada por bloqueio do Windows:',temporary,error.code));
}
