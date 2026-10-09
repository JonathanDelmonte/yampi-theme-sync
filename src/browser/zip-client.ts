import type {ArchiveEntries} from '../core/compression';
export function zipInWorker(entries:ArchiveEntries,signal?:AbortSignal):Promise<Uint8Array> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Preparação do ZIP cancelada.'));return;}
    const worker=new Worker(new URL('./zip-worker.js',import.meta.url),{type:'module',name:'yampi-zip'});
    const finish=(error?:Error,bytes?:Uint8Array)=>{signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(bytes!);};
    const cancel=()=>finish(new Error('Preparação do ZIP cancelada. Nenhum arquivo da Yampi foi alterado.'));
    worker.onmessage=event=>{const {bytes,error}=event.data as {bytes?:Uint8Array;error?:string};if(error||!(bytes instanceof Uint8Array))finish(new Error(error||'Resposta de compactação inválida.'));else finish(undefined,bytes);};
    worker.onerror=event=>{event.preventDefault();finish(new Error('Não foi possível executar a compactação local.'));};
    signal?.addEventListener('abort',cancel,{once:true});
    // Clone inputs: transferring would detach the originals needed for hashes/backup.
    try{worker.postMessage(entries);}catch(error){finish(error instanceof Error?error:new Error('Falha ao preparar o ZIP.'));}
  });
}
