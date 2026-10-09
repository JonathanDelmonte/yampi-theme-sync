import {describe,test,expect,vi} from 'vitest';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {publicUrl,visualData,previewType,demonstration,previewEntries,previewLimits} from '../src/core/preview';
import {staticContext,preparePreview,finishPreview} from '../src/browser/preview-capture';
import {fetchPublicResource} from '../src/browser/public-fetch';
import {encodeSnapshot,decodeProject} from '../src/core/archive';
import {demoSnapshot} from '../src/demo/sample';
// @ts-expect-error Embedded runtime is native JavaScript, exercised here at runtime.
import {twigHelpers} from '../local-runtime/platform.mjs';
// @ts-expect-error Embedded runtime is native JavaScript, exercised here at runtime.
import {pageContext,rewriteCSS} from '../local-runtime/preview.mjs';
const utf8=(text:string)=>new TextEncoder().encode(text);
const fakeDoc=(scripts:string[])=>({querySelectorAll:()=>scripts.map(text=>({textContent:text,id:'',getAttribute:()=>null}))}) as unknown as Document;
describe('contexto visual portátil separado do código',()=>{
  test('parser aceita literais e JSON/base64 sem executar chamadas, getters ou scripts',()=>{
    const spy=vi.fn();const data={merchant:{manifest:{name:'Fictícia 🎮',description:'Visível'},token:'PRIVATE',checkout:{token:'PRIVATE'},api:{key:'PRIVATE'},company:{email:'PRIVATE'}},themeConfig:{theme:{params:{color_general_background:'#102030',custom_css:'.test{color:red}',api_key:'PRIVATE'}}},products:[{id:2,name:'Original',description:'Descrição',url_path:'/produto-2',password:'PRIVATE'}]};
    const parsed=staticContext(fakeDoc(['window.data=JSON.parse(atob('+JSON.stringify(btoa(unescape(encodeURIComponent(JSON.stringify(data)))))+'));','window.product=executeDangerous();']));
    expect(parsed.data.merchantData).toMatchObject({manifest:{name:'Fictícia 🎮'}});
    const unicode=staticContext(fakeDoc(['window.data='+JSON.stringify(data)+';']));
    expect(unicode.data.merchantData).toMatchObject({manifest:{name:'Fictícia 🎮',description:'Visível'}});
    expect(JSON.stringify(parsed.data)).not.toContain('PRIVATE');expect(parsed.issues.join()).toContain('não é executada');
    const withGetter={...data};Object.defineProperty(withGetter,'product',{get:spy,enumerable:true});visualData(withGetter);expect(spy).not.toHaveBeenCalled();
    expect((unicode.data.products as any[])[0].description).toBe('Descrição');
  });
  test('não guarda credenciais, conteúdo ativo, estruturas dinâmicas ou URLs privadas',()=>{
    const result=visualData({merchant:{manifest:{name:'Exemplo'},logo_url:'https://cdn.invalid/logo.svg?token=SECRET'},products:[{name:'Fictício',description:'<script>alert(1)</script>',content:'<img onerror="run()">',images:{data:[{url:'https://cdn.invalid/img.png'}]}}]});
    expect(JSON.stringify(result)).not.toMatch(/SECRET|script>|onerror/);
    for(const url of ['http://cdn.invalid/a.png','https://127.0.0.1/a.png','https://local.local/a.png','https://u:p@cdn.invalid/a.png','https://cdn.invalid/checkout/a','https://cdn.invalid/a?auth=x','https://[::1]/a'])expect(()=>publicUrl(url,'https://store.invalid')).toThrow();
    expect(publicUrl('/image.svg?utm_source=x&_gl=tracking#test','https://store.invalid')).toBe('https://store.invalid/image.svg');
    expect(()=>visualData({products:Array.from({length:101},()=>({id:1}))})).toThrow('não foi truncada');expect(()=>previewLimits({resources:121})).toThrow();
  });
  test('configuração do editor tem prioridade em todas as rotas sem trocar seu conteúdo',async()=>{
    const source={merchant:{manifest:{name:'Fictícia'}},themeConfig:{theme:{params:{color_primary:'red'}}},products:[{id:1,name:'Produto',url_path:'/product-1'}]};
    const script={textContent:'window.data='+JSON.stringify(source)+';',id:'',getAttribute:()=>null};
    const doc={body:{className:'fictional'},querySelectorAll:(selector:string)=>selector.startsWith('script')?[script]:[]};
    vi.stubGlobal('DOMParser',class {parseFromString(){return doc;}});
    try{const result=await preparePreview(demoSnapshot,async url=>({url,bytes:utf8('<html/>'),type:'text/html'}),{editorData:visualData({pageConfig:{theme:{params:{color_primary:'blue'}}}})});
      expect(result.bundle.pages).toHaveLength(2);expect(result.bundle.pages.every(p=>(p.data.pageConfig as any).theme.params.color_primary==='blue')).toBe(true);expect(result.bundle.source.kind).toBe('editor');expect(result.bundle.issues.some(i=>i.code==='published-association')).toBe(true);
    }finally{vi.unstubAllGlobals();}
  });
  test('recusa SVG ativo, HTML disfarçado, tipos desconhecidos e hashes adulterados',async()=>{
    expect(()=>previewType(utf8('<svg onload="run()"/>'),'image/svg+xml')).toThrow('SVG');
    expect(()=>previewType(utf8('<html>erro</html>'),'image/png')).toThrow();
    const bundle=demonstration(demoSnapshot.context,'Teste');bundle.resources.push({url:'https://cdn.invalid/a.svg',path:'assets/'+'a'.repeat(64)+'.svg',type:'image/svg+xml',bytes:5,sha256:'a'.repeat(64)});expect(()=>previewType(utf8('unknown'),'text/plain')).toThrow();
    await expect(previewEntries(bundle)).rejects.toThrow('Asset');
  });
  test('permissão ausente, timeout, redirecionamento, tipo e limite são limitações explícitas',async()=>{
    const bundle=demonstration(demoSnapshot.context,'Teste');bundle.issues=[];
    const result=await finishPreview({bundle,urls:['https://cdn.invalid/a.svg','https://cdn.invalid/b.svg','https://other.invalid/a.svg'],documents:new Map()},async url=>{if(url.endsWith('a.svg'))return {bytes:utf8('<svg/>'),type:'image/svg+xml',url:url+'/redirect'};throw new Error('timeout explícito');},['https://cdn.invalid']);
    expect(result.issues).toHaveLength(3);expect(result.resources).toHaveLength(0);expect(result.issues.map(i=>i.reason).join()).toMatch(/Redirecionamento/);expect(result.issues.map(i=>i.reason).join()).toMatch(/autorizada/);
    const clipped=demonstration(demoSnapshot.context,'Teste');clipped.issues=[];clipped.limits.resources=1;
    await finishPreview({bundle:clipped,urls:['https://cdn.invalid/a.svg','https://cdn.invalid/b.svg'],documents:new Map()},async url=>({bytes:utf8('<svg/>'),type:'image/svg+xml',url}),['https://cdn.invalid']);expect(clipped.issues.some(i=>i.code==='resource-limit')).toBe(true);
  });
  test('download público é somente GET sem credenciais; streaming não é truncado',async()=>{
    const fetcher=vi.fn(async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}));
    expect((await fetchPublicResource('https://cdn.invalid/a.svg',['https://cdn.invalid'],fetcher as any)).encoded).toBe(btoa('<svg/>'));
    expect(fetcher).toHaveBeenCalledWith('https://cdn.invalid/a.svg',expect.objectContaining({method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}));
    await expect(fetchPublicResource('https://cdn.invalid/a.svg',[],fetcher as any)).rejects.toThrow('autorizada');
    const large=vi.fn(async()=>new Response(new Uint8Array(2*1024*1024+1)));await expect(fetchPublicResource('https://cdn.invalid/a.svg',['https://cdn.invalid'],large as any)).rejects.toThrow('não foi truncado');
    const redirected=vi.fn(async()=>{const r=new Response('<svg/>');Object.defineProperty(r,'url',{value:'https://other.invalid/a.svg'});return r;});await expect(fetchPublicResource('https://cdn.invalid/a.svg',['https://cdn.invalid'],redirected as any)).rejects.toThrow('redirecionado');
  });
  test('CSS importado referencia o hash final de dependências e preserva imports locais',async()=>{
    const bundle=demonstration(demoSnapshot.context,'Teste');bundle.issues=[];
    const resources:Record<string,{bytes:Uint8Array;type:string}>={
      'https://cdn.invalid/a.css':{bytes:utf8('@import "b.css"; .a{color:red}'),type:'text/css'},
      'https://cdn.invalid/b.css':{bytes:utf8('@font-face{font-family:Demo;src:url(https://cdn.invalid/font.woff2)}'),type:'text/css'},
      'https://cdn.invalid/font.woff2':{bytes:utf8('wOF2-fictional'),type:'font/woff2'}
    };
    await finishPreview({bundle,urls:['https://cdn.invalid/a.css'],documents:new Map()},async url=>({...resources[url],url}),['https://cdn.invalid']);
    const a=bundle.resources.find(r=>r.url.endsWith('/a.css'))!,b=bundle.resources.find(r=>r.url.endsWith('/b.css'))!;
    expect(new TextDecoder().decode(bundle.assets[a.path])).toContain('/preview/'+b.path);expect(bundle.issues).toHaveLength(0);await expect(previewEntries(bundle)).resolves.toBeDefined();
    expect(new TextDecoder().decode(bundle.assets[b.path])).not.toContain('placeholder');expect(new TextDecoder().decode(bundle.assets[b.path])).toContain('/preview/assets/');
    const result=rewriteCSS('@import "/preview/'+b.path+'";',{});expect(result).toContain('@import');expect(result).toContain('/preview/'+b.path);
    const colors=demonstration(demoSnapshot.context,'Teste');colors.data={pageConfig:{theme:{params:{color_primary:'#123456'}}}};colors.pages=[{id:'page-0',kind:'home',sourceUrl:demoSnapshot.context.previewOrigin+'/',data:colors.data}];
    await finishPreview({bundle:colors,urls:[],documents:new Map()},async()=>{throw new Error('Não deve ler');},[]);expect((colors.data.pageConfig as any).theme.params.color_primary).toBe('#123456');
  });
  test('ZIP mantém originais byte a byte; importador ignora preview mesmo em projeto aninhado',async()=>{
    const original=await encodeSnapshot(demoSnapshot,false),project=unzipSync(await encodeSnapshot(demoSnapshot,true));
    const code=unzipSync(original);for(const [key,value] of Object.entries(code))expect(project[key]).toEqual(value);
    const report=JSON.parse(new TextDecoder().decode(project['preview/report.json']));expect(report.visual).toBe('not-validated');expect(report.configuration.status).toBe('demonstration');
    project['preview/large.css']=new Uint8Array(3*1024*1024);project['preview/product.json']=strToU8('private fictional data');
    const nested=Object.fromEntries(Object.entries(project).map(([p,b])=>['local/'+p,b]));const decoded=await decodeProject(zipSync(nested));expect(decoded.baseline).toEqual(demoSnapshot);expect(decoded.local).toEqual(demoSnapshot.files);expect(Object.keys(decoded.local).some(p=>p.startsWith('preview'))).toBe(false);
  });
  test('contratos dos helpers respeitam família/peso e estilo/cor',()=>{
    const helpers=twigHelpers((v:string)=>v).functions;
    expect(helpers.font_weight('Display','bold')).toBe(700);expect(helpers.font_weight('Display','medium')).toBe(500);expect(helpers.font_weight('Display',600)).toBe(600);
    expect(helpers.button_bg_color('outline','#aabbcc')).toBe('transparent');expect(helpers.button_bg_color('filled','#123456')).toBe('#123456');expect(helpers.button_bg_color('#654321')).toBe('#654321');
  });
  test('edições locais de configuração prevalecem sem trocar o produto da rota',()=>{
    const original={pageConfig:{theme:{params:{color_primary:'red'}}},product:{data:{name:'Home'}}};const data=structuredClone(original);data.pageConfig.theme.params.color_primary='blue';
    const preview={data:original,pages:[{id:'page-1',kind:'product',data:{...original,product:{data:{name:'Outro produto'}}}}],map:{},source:{kind:'published'},issues:[],styles:[]};const result=pageContext(data,preview,'product','page-1');expect(result.product.data.name).toBe('Outro produto');expect(result.pageConfig.theme.params.color_primary).toBe('blue');
    expect(()=>pageContext(data,preview,'product','page-404')).toThrow('não encontrada');
    expect(rewriteCSS('@font-face{src:url(https://cdn.invalid/a.woff2)}',{'https://cdn.invalid/a.woff2':'/preview/assets/a.woff2'})).toContain('/preview/assets/a.woff2');
  });
});
