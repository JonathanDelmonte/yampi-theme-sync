import {parse} from 'acorn';
import {hashBytes, type Snapshot} from '../core/model';
import {publicUrl, visualData, demonstration, previewLimits, previewType, type Data, type Json, type PreviewBundle, type PreviewPage, type PreviewLimits, type PreviewIssue} from '../core/preview';
export interface FetchResult {bytes: Uint8Array; type: string; url: string}
export type PreviewFetch = (url: string) => Promise<FetchResult>;
type Ast = Record<string, any>;
function literal(node: Ast, depth=0): unknown {
  if(depth>16)throw new Error('Expressão estática aninhada demais.');
  if(node.type==='Literal'&&!node.regex&&typeof node.value!=='bigint')return node.value;
  if(node.type==='ArrayExpression')return node.elements.map((n:Ast)=>n?literal(n,depth+1):null);
  if(node.type==='ObjectExpression') {
    const out=Object.create(null);
    for(const p of node.properties) {
      if(p.type!=='Property'||p.computed||p.method||p.kind!=='init')throw new Error('Objeto dinâmico não é capturado.');
      const key=p.key.name??p.key.value;
      if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))throw new Error('Chave insegura.');
      out[key]=literal(p.value,depth+1);
    }
    return out;
  }
  if(node.type==='UnaryExpression'&&['-','+','!'].includes(node.operator)){const v=literal(node.argument,depth+1);return node.operator==='!'?!v:node.operator==='-'?-Number(v):Number(v);}
  if(node.type==='CallExpression'&&node.arguments.length===1&&(node.callee.name==='atob'||node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.name==='window'&&node.callee.property.name==='atob')){const value=literal(node.arguments[0],depth+1);if(typeof value!=='string'||value.length>2*1024*1024)throw new Error('Base64 inválido.');const binary=atob(value);try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{return binary;}}
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.name==='JSON'&&node.callee.property.name==='parse'&&node.arguments.length===1) {
    const value=literal(node.arguments[0],depth+1); if(typeof value!=='string'||value.length>2*1024*1024)throw new Error('JSON estático inválido.');return JSON.parse(value);
  }
  throw new Error('Expressão dinâmica não é executada.');
}
const names=new Set(['merchant','merchantData','themeConfig','pageConfig','data','product','categories','banners','collections','content','sections','filters']);
export function staticContext(document: Document): {data:Data;issues:string[]} {
  const values:Record<string,unknown>={},issues:string[]=[];
  for(const script of document.querySelectorAll('script:not([src])')) {
    const text=script.textContent||''; if(text.length>2*1024*1024){issues.push('Script/JSON excede limite; não foi truncado.');continue;}
    if(script.getAttribute('type')==='application/json'&&['yampi-preview-data','theme-data'].includes(script.id)) {
      try{Object.assign(values,JSON.parse(text));}catch{issues.push('JSON declarativo inválido.');} continue;
    }
    let body:Ast[];try{body=(parse(text,{ecmaVersion:'latest'}) as unknown as Ast).body;}catch{continue;}
    for(const statement of body) {
      const assignments=statement.type==='VariableDeclaration'?statement.declarations:statement.type==='ExpressionStatement'&&statement.expression.type==='AssignmentExpression'&&statement.expression.operator==='='?[statement.expression]:[];
      for(const assignment of assignments) {
        const target=assignment.id||assignment.left;
        const name=target.type==='Identifier'?target.name:target.type==='MemberExpression'&&!target.computed&&target.object.name==='window'?target.property.name:undefined;
        if(!names.has(name))continue;
        try{const value=literal(assignment.init||assignment.right);if(name==='data'&&value&&typeof value==='object')Object.assign(values,value);else values[name]=value;}catch(e){issues.push(name+': '+(e as Error).message);}
      }
    }
  }
  return {data:visualData(values),issues};
}
function object(v:Json|undefined):Data{return v&&!Array.isArray(v)&&typeof v==='object'?v:{};}
function items(v:Json|undefined):Data[]{const value=Array.isArray(v)?v:object(v).data;return Array.isArray(value)?value.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)) as Data[]:[];}
function addReference(value:string,base:string,output:Set<string>,issues?:PreviewIssue[]) {
  try{output.add(publicUrl(value,base));}catch(error){const reason=(error as Error).message;if(issues&&!issues.some(i=>i.code==='resource-rejected'&&i.reason===reason))issues.push({code:'resource-rejected',resource:base,reason});}
}
function references(value: unknown, base: string, output: Set<string>,issues?:PreviewIssue[]) {
  if(typeof value==='string') {
    if(/\.(?:png|jpe?g|webp|svg|woff2?|ttf|otf|css)(?:[?#]|$)/i.test(value)&&!/[\s{}]/.test(value))addReference(value,base,output,issues);
    for(const match of value.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi))if(!/^(#|data:)/.test(match[1]||match[2]))addReference(match[1]||match[2],base,output,issues);
  } else if(Array.isArray(value))for(const child of value)references(child,base,output,issues);
  else if(value&&typeof value==='object')for(const child of Object.values(value))references(child,base,output,issues);
}
export function resourceReferences(html: Document, data: Data, base: string,issues?:PreviewIssue[]): string[] {
  const urls=new Set<string>(); references(data,base,urls,issues);
  for(const element of html.querySelectorAll('img,source,link[rel="stylesheet"],style,[style]')) {
    for(const attr of ['src','data-src','href']) {const value=element.getAttribute(attr);if(value&&!value.startsWith('data:'))addReference(value,base,urls,issues);}
    const srcset=element.getAttribute('srcset')||element.getAttribute('data-srcset');if(srcset)for(const part of srcset.split(','))addReference(part.trim().split(/\s+/)[0],base,urls,issues);
    if(element.tagName==='STYLE')references(element.textContent||'',base,urls,issues);references(element.getAttribute('style')||'',base,urls,issues);
  }
  return [...urls];
}
export interface PreviewDraft {bundle:PreviewBundle; urls:string[]; documents:Map<string,Document>}
export async function preparePreview(snapshot:Snapshot, fetcher:PreviewFetch, options:{limits?:Partial<PreviewLimits>;editorData?:Data;enabled?:boolean;signal?:AbortSignal}={}):Promise<PreviewDraft> {
  const bundle=demonstration(snapshot.context,options.enabled===false?'Captura visual desativada ou sem permissão.':'A vitrine não expõe contexto estático compatível.');
  bundle.limits=previewLimits(options.limits);const docs=new Map<string,Document>(), urls=new Set<string>();
  if(options.enabled===false)return {bundle,urls:[],documents:docs};
  const origin=publicUrl(snapshot.context.previewOrigin,snapshot.context.previewOrigin),queue:[string,string][]=[['home',origin]],seen=new Set<string>();
  bundle.issues=[];
  while(queue.length&&bundle.pages.length<bundle.limits.pages) {
    if(options.signal?.aborted)throw new Error('Captura de prévia cancelada.');
    const [kind,url]=queue.shift()!;if(seen.has(url))continue;seen.add(url);
    try {
      const response=await fetcher(url);if(response.bytes.length>bundle.limits.jsonBytes||!response.type.startsWith('text/html'))throw new Error('Página não é HTML público dentro do limite.');
      if(publicUrl(response.url,url)!==url)throw new Error('Redirecionamento não autorizado.');
      const doc=new DOMParser().parseFromString(new TextDecoder('utf-8',{fatal:true}).decode(response.bytes),'text/html');
      const parsed=staticContext(doc); for(const reason of parsed.issues)bundle.issues.push({code:'static-data',resource:url,reason});
      let data=parsed.data;
      data.bodyClasses=doc.body.className.split(/\s+/).filter(name=>/^[a-z0-9_-]{1,100}$/i.test(name)).slice(0,30);
      if(options.editorData?.pageConfig) {
        data={...data,pageConfig:{...object(options.editorData.pageConfig),page:kind}};
        // Editor settings have priority on every route, while product/category
        // content remains specific to the captured public page.
        const editorSections=object(options.editorData.sections),publicSections=object(data.sections);
        if(Object.keys(editorSections).length)data.sections={...publicSections,...Object.fromEntries(['header','footer','global'].filter(key=>editorSections[key]!==undefined).map(key=>[key,editorSections[key]])),...(editorSections[kind]?{main:editorSections[kind]}:{})};
        bundle.source={kind:'editor',origin:snapshot.context.previewOrigin,association:'same-editor'};
      }
      if(!data.pageConfig&&!data.merchantData)throw new Error('Configuração e identidade públicas não encontradas; nenhuma variável foi executada.');
      const products=items(data.products??object(data.content).data);
      if(products.length>bundle.limits.products){data={...data,products:products.slice(0,bundle.limits.products)};bundle.issues.push({code:'product-limit',resource:url,reason:`Amostra limitada a ${bundle.limits.products} produtos de ${products.length}.`});}
      else if(products.length)data.products=products;
      const page:PreviewPage={id:'page-'+bundle.pages.length,kind,sourceUrl:url,data};bundle.pages.push(page);docs.set(url,doc);
      if(kind==='home') {
        bundle.data=data;if(bundle.source.kind!=='editor')bundle.source={kind:'published',origin:snapshot.context.previewOrigin,association:'published-unverified'};
        bundle.issues.push({code:'published-association',reason:'A vitrine publicada pode diferir do rascunho. O tema publicado não foi vinculado independentemente ao estado do editor.'});
        if(!Object.keys(object(object(data.pageConfig).theme).params||{}).length)bundle.issues.push({code:'configuration-incomplete',reason:'Parâmetros visuais do tema não foram encontrados em formato estático compatível.'});
        if(!products.length)bundle.issues.push({code:'catalog-sample-unavailable',reason:'Nenhum produto foi encontrado no contexto estático da home; o backend não é consultado.'});
      }
      for(const resource of resourceReferences(doc,data,url,bundle.issues))urls.add(resource);
      const candidates:[string,string][]=[];
      for(const product of items(data.products))if(typeof product.url_path==='string')candidates.push(['product',product.url_path]);
      for(const category of items(data.categories??object(data.merchantData).categories))if(typeof category.url_path==='string')candidates.push(['category',category.url_path]);
      // Only explicit product/category data routes, never arbitrary checkout/menu links.
      const count=new Map<string,number>();for(const [nextKind,target] of candidates)try{
        const next=publicUrl(target,url);if(new URL(next).origin!==snapshot.context.previewOrigin)continue;
        const n=count.get(nextKind)||0;if(n<2&&!seen.has(next)){queue.push([nextKind,next]);count.set(nextKind,n+1);}
      }catch(e){bundle.issues.push({code:'route-rejected',reason:(e as Error).message});}
    }catch(e){bundle.issues.push({code:'page-unavailable',resource:url,reason:(e as Error).message});}
  }
  if(queue.length)bundle.issues.push({code:'page-limit',reason:`Recorte limitado a ${bundle.limits.pages} páginas; ${queue.length} candidatas restantes.`});
  if(!bundle.pages.length)bundle.issues.push({code:'visual-context-unavailable',reason:'Nenhuma página visual compatível foi capturada. A prévia será demonstrativa.'});
  for(const source of Object.values(snapshot.files))references(source,origin,urls,bundle.issues);
  return {bundle,urls:[...urls],documents:docs};
}
function rewrite(value:Json,map:Map<string,string>,base:string):Json {
  if(typeof value==='string') {
    let result=value;
    if(/^(?:https?:)?\/\/|^\/(?!\/)|^\.\.?\/|^[^\s]+\.(?:png|jpe?g|webp|svg|woff2?|ttf|otf|css)(?:[?#]|$)/i.test(value))try{const key=publicUrl(value,base);if(map.has(key))return map.get(key)!;}catch{}
    for(const [remote,local]of map){result=result.split(remote).join(local);result=result.split(remote.replace(/^https:/,'')).join(local);}
    return result.replace(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi,(whole,url)=>{if(url.startsWith('#')||url.startsWith('data:')||url.startsWith('/preview/assets/'))return whole;try{return `url("${map.get(publicUrl(url,base))||'/__local/placeholder.svg'}")`;}catch{return 'url("/__local/placeholder.svg")';}});
  }
  if(Array.isArray(value))return value.map(v=>rewrite(v,map,base));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,map,base)]));return value;
}
export async function finishPreview(draft:PreviewDraft,fetcher:PreviewFetch,allowedOrigins:string[],signal?:AbortSignal):Promise<PreviewBundle> {
  const {bundle}=draft,queue=[...draft.urls],seen=new Set<string>(),map=new Map<string,string>();let total=0;
  // CSS is fetched first to discover font/icon dependencies. Each additional origin
  // still needs explicit permission; missing origins produce a partial report.
  queue.sort((a,b)=>Number(/\.css(?:\?|$)/.test(b))-Number(/\.css(?:\?|$)/.test(a)));
  while(queue.length) {
    if(signal?.aborted)throw new Error('Captura de recursos cancelada.');
    const url=queue.shift()!;if(seen.has(url))continue;seen.add(url);
    if(seen.size>bundle.limits.resources){bundle.issues.push({code:'resource-limit',reason:`Recorte de ${bundle.limits.resources} recursos atingido.`});break;}
    try {
      if(!allowedOrigins.includes(new URL(url).origin))throw new Error('Origem não autorizada para leitura.');
      const response=await fetcher(url),bytes=response.bytes;
      if(response.url!==url)throw new Error('Redirecionamento rejeitado.');if(!bytes.length||bytes.length>bundle.limits.resourceBytes||(total+bytes.length)>bundle.limits.totalBytes)throw new Error('Recurso ultrapassa os limites de tamanho.');
      const ext=previewType(bytes,response.type),sha=await hashBytes(bytes),file='assets/'+sha+'.'+ext;
      if(!bundle.assets[file]){bundle.assets[file]=bytes;total+=bytes.length;}
      bundle.resources.push({url,path:file,type:response.type,bytes:bytes.length,sha256:sha});map.set(url,'/preview/'+file);
      if(ext==='css') {const css=new TextDecoder().decode(bytes),refs=new Set<string>();references(css,url,refs,bundle.issues);queue.push(...refs);}
    }catch(e){bundle.issues.push({code:'asset-unavailable',resource:url,reason:(e as Error).message});}
  }
  // Rewrite CSS after all fonts/images are collected. Its final hash records the
  // portable bytes rather than the pre-rewrite network response.
  const cssItems=new Map(bundle.resources.filter(r=>r.path.endsWith('.css')).map(item=>[item.url,item]));
  const cssSources=new Map([...cssItems].map(([url,item])=>[url,new TextDecoder().decode(bundle.assets[item.path])]));
  const built=new Set<string>();
  const resolveCSS=async(url:string,stack:Set<string>):Promise<void>=>{
    if(built.has(url))return;
    const item=cssItems.get(url)!;stack=new Set([...stack,url]);
    let css=cssSources.get(url)!;
    for(const [whole,target,quoted] of [...css.matchAll(/@import\s+(?:url\(\s*["']?([^"')\s]+)["']?\s*\)|["']([^"']+)["'])[^;]*;/gi)]){
      let dependency;try{dependency=publicUrl(target||quoted,url);}catch{css=css.split(whole).join('/* Import inseguro rejeitado. */');continue;}
      if(stack.has(dependency)){bundle.issues.push({code:'css-import-cycle',resource:url,reason:'Import CSS cíclico removido; demais regras preservadas.'});css=css.split(whole).join('/* Import cíclico indisponível na prévia portátil. */');continue;}
      if(cssItems.has(dependency))await resolveCSS(dependency,stack);
      const local=map.get(dependency);css=css.split(whole).join(local?whole.replace(target||quoted,local):'/* Import não capturado; consulte o relatório visual. */');
    }
    const rewritten=new TextEncoder().encode(rewrite(css,map,item.url) as string),sha=await hashBytes(rewritten),file='assets/'+sha+'.css';
    bundle.assets[file]=rewritten;const old=item.path;item.path=file;item.bytes=rewritten.length;item.sha256=sha;map.set(item.url,'/preview/'+file);
    if(!bundle.resources.some(r=>r.path===old))delete bundle.assets[old];
    // Only captured font/icon declarations supplement compiled theme styles.
    const fonts=(new TextDecoder().decode(rewritten).match(/@font-face\s*\{[^}]*\}/gi)||[]).join('\n');if(fonts)bundle.styles.push(fonts);
    built.add(url);
  };
  // Resolve dependencies first: a rewritten imported sheet has a different hash,
  // and parent imports must point at those final portable bytes.
  for(const url of cssItems.keys())await resolveCSS(url,new Set());
  for(const file of Object.keys(bundle.assets))if(!bundle.resources.some(r=>r.path===file))delete bundle.assets[file];
  bundle.data=rewrite(bundle.data,map,bundle.source.origin) as Data;
  bundle.pages=bundle.pages.map(page=>({...page,data:rewrite(page.data,map,page.sourceUrl) as Data}));
  const routes=new Map(bundle.pages.map(p=>[p.sourceUrl,`/preview?page=${p.kind}&capture=${p.id}`]));
  bundle.data=rewrite(bundle.data,routes,bundle.source.origin) as Data;bundle.pages=bundle.pages.map(p=>({...p,data:rewrite(p.data,routes,p.sourceUrl) as Data}));
  return bundle;
}
