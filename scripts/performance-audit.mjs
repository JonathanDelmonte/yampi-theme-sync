// Reproducible synthetic benchmark. Never opens a real store or imports a client export.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');
const label=process.argv[2]||'current';if(!/^[a-z0-9-]+$/.test(label))throw Error('Nome de execução inválido.');
const out=path.join(root,'.cache/performance',label);await mkdir(out,{recursive:true});
const reference=process.argv.find(arg=>arg.startsWith('--ref='))?.slice(6);
let sourceRoot=root;
if(reference){
  if(!/^[a-f0-9]{40}$/.test(reference))throw Error('Use o SHA completo de um commit do projeto.');
  sourceRoot=path.join(out,'source');
  const paths=execFileSync('git',['ls-tree','-r','-z','--name-only',reference,'--','src','local-runtime'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  for(const name of paths){if(!/^(src|local-runtime)\/[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(part=>part==='..'||part==='.'))throw Error('Caminho histórico inseguro.');const target=path.join(sourceRoot,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,execFileSync('git',['show',reference+':'+name],{cwd:root,maxBuffer:8*1024*1024}));}
}
const raw={name:'raw',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:path.resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}};
if(!process.argv.includes('--reuse'))await build({entryPoints:[path.join(sourceRoot,'src/core/archive.ts'),path.join(sourceRoot,'src/browser/preview-capture.ts'),path.join(sourceRoot,'src/core/preview.ts')],outdir:out,outbase:path.join(sourceRoot,'src'),bundle:true,platform:'node',format:'esm',plugins:[raw]});
const {encodeSnapshot,decodeProject}=await import(pathToFileURL(path.join(out,'core/archive.js')));
const {finishPreview}=await import(pathToFileURL(path.join(out,'browser/preview-capture.js')));
const {demonstration}=await import(pathToFileURL(path.join(out,'core/preview.js')));
const context={storeName:'Loja fictícia da auditoria',previewOrigin:'https://audit-store.invalid',editorOrigin:'https://editor.invalid'};
const files=Object.assign(Object.create(null),Object.fromEntries(Array.from({length:250},(_,i)=>[`components/fictional-${i}.vue`,`<template><p>Exemplo fictício ${i}</p></template>\n`+`// Código inteiramente fictício para medir compactação ${i}\n`.repeat(90)])));
let seed=17;const assets=Object.create(null);
for(let i=0;i<4;i++){const pixels=Buffer.alloc(512*512*3);for(let n=0;n<pixels.length;n++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[n]=seed&255;}assets[`assets/images/fictional-${i}.png`]=new Uint8Array(await sharp(pixels,{raw:{width:512,height:512,channels:3}}).png().toBuffer());}
const snapshot={context,capturedAt:'2026-10-09T00:00:00.000Z',files,assets};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const archiveTimes=[];let archiveBytes;
for(let n=0;n<3;n++){const start=performance.now();const bytes=await encodeSnapshot(snapshot,true);archiveTimes.push(performance.now()-start);archiveBytes=bytes.length;const decoded=await decodeProject(bytes);assert.deepEqual(decoded.baseline,snapshot);assert.deepEqual(decoded.local,files);assert.deepEqual(decoded.localAssets,assets);}
const resourceTimes=[];let peak=0;
for(let n=0;n<3;n++){let active=0;const bundle=demonstration(context,'Exemplo fictício');bundle.issues=[];const urls=Array.from({length:24},(_,i)=>`https://audit-cdn.invalid/${i}.svg`);const start=performance.now();const result=await finishPreview({bundle,urls,documents:new Map()},async url=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,25));active--;return {url,bytes:new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><title>Fictício ${url}</title></svg>`),type:'image/svg+xml'};},['https://audit-cdn.invalid']);resourceTimes.push(performance.now()-start);assert.equal(result.resources.length,24);assert.equal(result.issues.length,0);}
const bundle=demonstration(context,'Exemplo fictício');bundle.issues=[];
const draft={bundle,urls:['https://audit-cdn.invalid/0.svg','https://audit-other.invalid/1.svg'],documents:new Map()};let retryGets=0;
const fetcher=async url=>{retryGets++;return {url,bytes:new TextEncoder().encode('<svg></svg>'),type:'image/svg+xml'};};
await finishPreview(draft,fetcher,['https://audit-cdn.invalid']);await finishPreview(draft,fetcher,['https://audit-cdn.invalid','https://audit-other.invalid']);
let brandSource;try{brandSource=await readFile(path.join(root,'assets/zirtuno-logo-source.png'));}catch(error){if(error.code!=='ENOENT')throw error;brandSource=await readFile(path.join(root,'extension/brand/zirtuno-logo.png'));}
const report={label,scope:'Somente dados fictícios; latência simulada de 25 ms; não mede a rede nem a loja real',node:process.version,textFiles:250,images:4,archive:{medianMs:median(archiveTimes),samplesMs:archiveTimes,bytes:archiveBytes,roundTrip:'250 textos e quatro PNGs preservados byte a byte'},resources:{count:24,medianMs:median(resourceTimes),samplesMs:resourceTimes,maxConcurrent:peak},retry:{getsForTwoResourcesAcrossTwoPermissions:retryGets},brand:{sourceBytes:brandSource.length,distributedBytes:(await readFile(path.join(root,'dist/brand/zirtuno-logo.png'))).length}};
report.sourceReference=reference||'working-tree';
if(reference)report.brand={sourceBytes:execFileSync('git',['show',reference+':extension/brand/zirtuno-logo.png'],{cwd:root,maxBuffer:4*1024*1024}).length,distributedBytes:execFileSync('git',['show',reference+':extension/brand/zirtuno-logo.png'],{cwd:root,maxBuffer:4*1024*1024}).length};
if(process.argv.includes('--reuse'))report.brand=JSON.parse(await readFile(path.join(out,'report.json'),'utf8')).brand;
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
