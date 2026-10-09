// Real Web Worker in a disposable local browser; no Google/Yampi session is used.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.cache/performance/worker');await mkdir(out,{recursive:true});
await build({stdin:{contents:`import {zipInWorker} from './src/browser/zip-client';import {compressArchive} from './src/core/compression';import {unzipSync} from 'fflate';
window.runCheck=async()=>{
 const entries={};let seed=17;
 for(let i=0;i<250;i++)entries['tema/components/f-'+i+'.vue']=new TextEncoder().encode('// Exemplo fictício '+i+'\\n'+('const fictional=true;\\n'.repeat(250)));
 for(let i=0;i<4;i++){const bytes=new Uint8Array(1024*1024);for(let j=0;j<bytes.length;j++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[j]=seed&255;}entries['tema/assets/f-'+i+'.png']=bytes;}
 let ticks=0;const timer=setInterval(()=>{ticks++;document.querySelector('#ticks').textContent=String(ticks);},5),start=performance.now();
 const zip=await zipInWorker(entries);clearInterval(timer);const elapsed=performance.now()-start;
 const decoded=unzipSync(zip);let equal=Object.keys(decoded).length===Object.keys(entries).length;
 for(const [name,bytes]of Object.entries(entries))equal=equal&&bytes.length===decoded[name].length&&bytes.every((byte,i)=>byte===decoded[name][i]);
 const control=new AbortController();const pending=zipInWorker(entries,control.signal).then(()=>false,error=>error.message.includes('cancelada'));setTimeout(()=>control.abort(),1);const cancelled=await pending;
 const syncStart=performance.now();compressArchive(entries);const syncMs=performance.now()-syncStart;
 return {workerMs:elapsed,syncMs,uiTicks:ticks,equal,cancelled,inputBytes:Intl.NumberFormat('en').format(Object.values(entries).reduce((n,b)=>n+b.length,0))};
};`,resolveDir:root},outfile:path.join(out,'zip-check.js'),bundle:true,format:'esm',platform:'browser'});
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'}).end('<p>Auditoria fictícia de compactação</p><output id="ticks">0</output><script type="module" src="/zip-check.js"></script>');return;}const file=req.url==='/zip-check.js'?path.join(out,'zip-check.js'):req.url==='/zip-worker.js'?path.join(root,'dist/zip-worker.js'):null;if(!file)throw Error('route');res.writeHead(200,{'content-type':'text/javascript'}).end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();const errors=[],workers=[];page.on('pageerror',e=>errors.push(e.message));page.on('worker',worker=>workers.push(worker));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof window.runCheck==='function');const result=await page.evaluate(()=>window.runCheck());assert.equal(result.equal,true);assert.equal(result.cancelled,true);assert.ok(result.uiTicks>0);assert.deepEqual(errors,[]);assert.ok(workers.length>=1);for(let i=0;i<100&&page.workers().length;i++)await page.waitForTimeout(50);assert.equal(page.workers().length,0);await page.waitForFunction(()=>document.querySelector('#ticks').textContent!=='0');const report={scope:'Worker local, entradas fictícias, sem acesso a loja real',...result};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}finally{await browser.close();await new Promise(r=>server.close(r));}
