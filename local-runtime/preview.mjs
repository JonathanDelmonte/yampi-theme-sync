import {safeRead, digest, readProject} from './engine.mjs';
const MIMES={png:'image/png',jpg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',css:'text/css; charset=utf-8'};
export function assetPath(value) {if(!/^assets\/[a-f0-9]{64}\.(png|jpg|webp|svg|woff2?|ttf|otf|css)$/.test(value))throw new Error('Asset de prévia com caminho inseguro.');return value;}
function validAsset(bytes,ext) {
  const hex=bytes.subarray(0,12).toString('hex');
  if(ext==='png')return hex.startsWith('89504e470d0a1a0a');if(ext==='jpg')return hex.startsWith('ffd8ff');
  if(ext==='webp')return hex.startsWith('52494646')&&hex.slice(16,24)==='57454250';
  if(ext==='woff2')return hex.startsWith('774f4632');if(ext==='woff')return hex.startsWith('774f4646');
  if(ext==='ttf')return hex.startsWith('00010000');if(ext==='otf')return hex.startsWith('4f54544f');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(ext==='css')return !/<\/?(?:script|html)\b/i.test(text);
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)&&!/<(?:script|foreignObject|iframe)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']?(?:https?:|\/\/|javascript:|data:)/i.test(text);
}
export function localAsset(value, mapping={}) {
  const src=String(value||'');if(/^\/preview\/assets\//.test(src)||/^data:image\/(?:png|jpeg|webp);base64,/.test(src))return src;
  if(mapping[src])return mapping[src];if(src.startsWith('/tema/assets/'))return src;try{const url=new URL(src,mapping.__origin);if(mapping[url.href])return mapping[url.href];}catch{}
  return '/__local/placeholder.svg';
}
export async function loadPreview(root, project) {
  let bytes;try{bytes=await safeRead(root,'preview/manifest.json');}catch(error){if(error.code==='ENOENT')return {source:{kind:'demonstration',association:'unavailable'},issues:[{code:'legacy-preview',reason:'Projeto sem contexto visual capturado. Dados locais não certificam fidelidade.'}],resources:[],assets:{},styles:[],pages:[],map:{},data:{}};throw error;}
  const manifest=JSON.parse(bytes);
  if(manifest.format!=='yampi-local-preview'||manifest.version!==1||!Number.isFinite(Date.parse(manifest.capturedAt))||manifest.source?.origin!==project.manifest.context.previewOrigin||!['editor','published','demonstration'].includes(manifest.source.kind)||!['same-editor','published-unverified','unavailable'].includes(manifest.source.association)||!Array.isArray(manifest.resources)||manifest.resources.length>120||!Array.isArray(manifest.issues)||manifest.issues.length>500||!Array.isArray(manifest.styles))throw new Error('Manifesto visual inválido ou de outra loja.');
  const dataBytes=await safeRead(root,'preview/data.json');
  if(!manifest.dataFile||dataBytes.length!==manifest.dataFile.bytes||digest(dataBytes)!==manifest.dataFile.sha256)throw new Error('Dados capturados de prévia ausentes ou alterados. Edite local.data.json para personalizar.');
  const captured=JSON.parse(dataBytes);if(!Array.isArray(captured.pages)||captured.pages.length>7)throw new Error('Páginas capturadas inválidas.');
  const assets={},map={__origin:manifest.source.origin};let total=0;
  for(const item of manifest.resources) {
    assetPath(item.path);const url=new URL(item.url);
    if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|auth|session|password|key|signature/i.test(k)))throw new Error('URL de recurso visual inválida.');
    if(!assets[item.path]) {const value=await safeRead(root,'preview/'+item.path);if(value.length!==item.bytes||value.length>2*1024*1024||digest(value)!==item.sha256||!item.path.includes(item.sha256)||!validAsset(value,item.path.split('.').at(-1))||(total+=value.length)>24*1024*1024)throw new Error('Asset capturado ausente, inseguro ou alterado: '+item.path);assets[item.path]=value;}
    else if(assets[item.path].length!==item.bytes||digest(assets[item.path])!==item.sha256)throw new Error('Recurso duplicado inconsistente.');
    map[item.url]='/preview/'+item.path;const tail=url.pathname.match(/\/assets\/(.+)$/)?.[1];if(tail){const alias='/tema/assets/'+tail;map[alias]=map[alias]&&map[alias]!==map[item.url]?'':map[item.url];}
  }
  for(const page of captured.pages)if(!/^page-\d+$/.test(page.id)||!['home','category','product','promotion','pages'].includes(page.kind)||new URL(page.sourceUrl).origin!==manifest.source.origin||!page.data||typeof page.data!=='object')throw new Error('Rota capturada inválida.');
  return {...manifest,...captured,assets,map};
}
export function pageContext(data, preview, page, capture) {
  const match=capture?preview.pages.find(p=>p.id===capture&&p.kind===page):preview.pages.find(p=>p.kind===page);
  if(capture&&!match)throw new Error('Página capturada não encontrada.');
  // Apply only the user's changes to the captured home data over each route.
  // Unchanged home products/content must not replace a distinct product page.
  const overlay=(base,local,original)=>{
    if(JSON.stringify(local)===JSON.stringify(original))return base;
    if(local&&original&&base&&typeof local==='object'&&typeof original==='object'&&!Array.isArray(local)&&!Array.isArray(original)) {
      const out={...base};for(const key of new Set([...Object.keys(local),...Object.keys(original)])) {
        if(!(key in local)){delete out[key];continue;}out[key]=overlay(base[key],local[key],original[key]);
      }return out;
    }return local;
  };
  const merged=match?overlay({...data,...match.data},data,preview.data):data;
  const output={...merged,page,pageConfig:{...merged.pageConfig,page},__preview:{source:preview.source,issues:preview.issues,capturedAt:preview.capturedAt,assetMap:preview.map,routes:preview.pages.map(p=>({id:p.id,kind:p.kind,sourceUrl:p.sourceUrl})),styles:preview.styles}};
  if(data.mainSectionsByPage&&!match)output.mainSections=data.mainSectionsByPage[page]||[];
  const sections=output.sections;
  if(sections&&!Array.isArray(sections)){output.header=output.header||sections.header;output.footer=output.footer||sections.footer;if(sections.main)output.mainSections=sections.main;}
  return output;
}
export function rewriteCSS(css, mapping) {
  return css.replace(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi,(whole,src)=>{
    if(src.startsWith('#')||src.startsWith('data:')||src.startsWith('/preview/')||src.startsWith('/tema/')&&!mapping[src])return whole;
    const local=localAsset(src,mapping);return local==='/__local/placeholder.svg'&&!/\.(?:png|jpe?g|webp|svg)(?:\?|$)/i.test(src)?'url("")':`url("${local}")`;
  }).replace(/@import\s+(?:url\(\s*["']?([^"')\s]+)["']?\s*\)|["']([^"']+)["'])[^;]*;/gi,(whole,target,quoted)=>{const src=target||quoted;if(/^\/(?:preview|tema)\//.test(src))return whole;const local=mapping[src];return local?whole.replace(src,local):'/* Import não capturado; consulte o relatório visual. */';});
}
export async function checkIntegrity(root) {
  const project=await readProject(root), preview=await loadPreview(root,project);
  const changed=Object.keys(project.files).filter(p=>!project.baseline[p]||digest(project.files[p])!==digest(project.baseline[p]));
  return {originalFiles:project.manifest.files.length,localFiles:Object.keys(project.files).length,changed:changed.length,originalIntegrity:'SHA-256 e tamanho conferidos',codeCompleteness:'Inventário estável do editor; sem auditoria independente do inventário remoto',previewSource:preview.source,capturedAssets:Object.keys(preview.assets).length,issues:preview.issues,visual:'not-validated'};
}
export const resourceMime=path=>MIMES[path.split('.').at(-1)]||'application/octet-stream';
