import {publicUrl} from '../core/preview';
const MAX=2*1024*1024;
export async function fetchPublicResource(url: string, allowedOrigins: string[], fetcher: typeof fetch = fetch):Promise<{url:string;type:string;encoded:string}> {
  const target=publicUrl(url,url);
  if(!allowedOrigins.includes(new URL(target).origin))throw new Error('Origem de recurso não autorizada para esta captura.');
  const response=await fetcher(target,{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
  if(!response.ok||response.url&&response.url!==target||Number(response.headers.get('content-length'))>MAX)throw new Error('Recurso público indisponível, redirecionado ou grande demais.');
  const reader=response.body?.getReader();if(!reader)throw new Error('Recurso público sem conteúdo.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>MAX)throw new Error('Recurso público ultrapassa 2 MiB; não foi truncado.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {url:target,type:response.headers.get('content-type')||'application/octet-stream',encoded:btoa(binary)};
}
