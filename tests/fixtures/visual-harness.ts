import {visualStore} from './visual-stores';
import {preparePreview,finishPreview} from '../../src/browser/preview-capture';
import {encodeSnapshot} from '../../src/core/archive';
import {fetchPublicResource} from '../../src/browser/public-fetch';
export {visualStore};
export async function capture(tone:'dark'|'light') {
  const fixture=visualStore(tone),origins=[fixture.snapshot.context.previewOrigin,'https://'+tone+'-cdn.invalid'];
  const fetcher=async(url:string)=>{const result=await fetchPublicResource(url,origins);return {url:result.url,type:result.type,bytes:Uint8Array.from(atob(result.encoded),c=>c.charCodeAt(0))};};
  const draft=await preparePreview(fixture.snapshot,fetcher),preview=await finishPreview(draft,fetcher,origins);
  const zip=await encodeSnapshot(fixture.snapshot,true,preview);
  let binary='';for(let i=0;i<zip.length;i+=8192)binary+=String.fromCharCode(...zip.subarray(i,i+8192));
  return {zip:btoa(binary),resources:preview.resources,issues:preview.issues,pages:preview.pages,source:preview.source,expected:fixture.expected};
}
