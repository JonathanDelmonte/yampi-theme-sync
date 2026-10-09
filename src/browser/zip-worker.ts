import {compressArchive,type ArchiveEntries} from '../core/compression';
const worker=self as unknown as {onmessage:((event:MessageEvent<ArchiveEntries>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
worker.onmessage=event=>{
  try{const bytes=compressArchive(event.data);worker.postMessage({bytes},[bytes.buffer as ArrayBuffer]);}
  catch(error){worker.postMessage({error:error instanceof Error?error.message:'Não foi possível preparar o ZIP.'});}
};
