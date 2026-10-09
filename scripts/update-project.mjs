import path from 'node:path';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readProject,safeRead,digest} from '../local-runtime/engine.mjs';
const repository=path.resolve(import.meta.dirname,'..'),runtime=path.join(repository,'local-runtime');
const tools=['engine.mjs','dev.mjs','pack.mjs','platform.mjs','platform-browser.mjs','twig.mjs','preview.mjs','integrity.mjs'];
const json=v=>JSON.stringify(v,null,2)+'\n';
async function destination(root,relative) {
  const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw new Error('Destino fora do projeto.');
  let current=root;
  for(const part of path.relative(root,target).split(path.sep)){
    current=path.join(current,part);try{if((await lstat(current)).isSymbolicLink())throw new Error('Links não são aceitos no destino da atualização.');}catch(error){if(error.code!=='ENOENT')throw error;}
  }return target;
}
export async function updateProject(target,{apply=false}={}) {
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('Use Node.js 24.');
  if((await lstat(target)).isSymbolicLink())throw new Error('Pasta de destino não pode ser um link.');
  const root=await realpath(target);
  if(root===repository||root.startsWith(repository+path.sep)||repository.startsWith(root+path.sep))throw new Error('Mantenha o projeto da loja fora do repositório público da extensão.');
  const project=await readProject(root),pkgBytes=await safeRead(root,'package.json'),lockBytes=await safeRead(root,'package-lock.json'),pkg=JSON.parse(pkgBytes),lock=JSON.parse(lockBytes);
  const latest=JSON.parse(await readFile(path.join(runtime,'package.json'),'utf8'));
  if(!lock.packages?.['']||!pkg.scripts||!pkg.dependencies)throw new Error('Pacote local não reconhecido.');
  // Current runtime and explicitly recorded historical tool hashes are trusted.
  // A user-edited tool is refused before writing anything, rather than replaced.
  const history=JSON.parse(await readFile(path.join(import.meta.dirname,'runtime-versions.json'),'utf8'));
  const changes=[],preserved=[];
  for(const name of tools) {
    const relative='.yampi-sync/tools/'+name,next=await readFile(path.join(runtime,name));let before=null;
    try{before=await safeRead(root,relative);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(before&&digest(before)!==digest(next)&&!history[name]?.includes(digest(before))&&!history[name]?.includes(digest(before.toString('utf8').replace(/\r\n/g,'\n'))))throw new Error('Ferramenta modificada pelo usuário; preservada sem atualização: '+relative);
    if(!before||!before.equals(next))changes.push({path:relative,before,next});
  }
  for(const [name,value] of Object.entries(latest.scripts)) {
    const previous=pkg.scripts[name];
    if(!previous||previous===value||previous===`node .yampi-sync/tools/dev.mjs${name==='check'?' --check':''}`)pkg.scripts[name]=value;
    else preserved.push('script personalizado: '+name);
  }
  for(const [name,value] of Object.entries(latest.dependencies)) {
    // Dependency changes require an explicit installation/merge, not silently
    // modifying a user's lockfile or executing project lifecycle scripts.
    if(pkg.dependencies[name]!==value)throw new Error('Dependência local diferente: '+name+'. Preserve suas escolhas e ajuste package.json/lockfile antes de atualizar; esperado '+value+'.');
  }
  if(/^0\.2\./.test(pkg.version))pkg.version=latest.version;
  lock.version=pkg.version;lock.packages[''].version=pkg.version;
  const nextPkg=Buffer.from(json(pkg)),nextLock=Buffer.from(json(lock));
  if(!pkgBytes.equals(nextPkg))changes.push({path:'package.json',before:pkgBytes,next:nextPkg});
  if(!lockBytes.equals(nextLock))changes.push({path:'package-lock.json',before:lockBytes,next:nextLock});
  for(const change of changes)await destination(root,change.path);
  const plan={root,store:project.manifest.context.storeName,version:latest.version,apply,changed:changes.map(c=>c.path),preserved,untouched:['tema/','.yampi-sync/baseline/','.yampi-sync/manifest.json','local.data.json','local.config.json','preview/'],visualContext:'Uma atualização de ferramentas não captura os dados ausentes de uma exportação antiga. Faça uma nova exportação separada para obter contexto visual.'};
  if(!apply||!changes.length)return plan;
  const backup='.yampi-sync/updates/'+new Date().toISOString().replace(/[:.]/g,'-');const journal={...plan,completed:[],status:'prepared',backup};
  await mkdir(await destination(root,backup),{recursive:true});
  for(const change of changes)if(change.before){const file=await destination(root,backup+'/before/'+change.path);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,change.before,{flag:'wx'});}
  const journalPath=await destination(root,backup+'/journal.json');await writeFile(journalPath,json(journal),{flag:'wx'});
  try {
    for(const change of changes) {
      // Recheck against concurrent local edits before every replacement.
      let now=null;try{now=await safeRead(root,change.path);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(change.before?!now||digest(now)!==digest(change.before):now)throw new Error('Arquivo mudou durante a atualização: '+change.path);
      await writeFile(await destination(root,change.path),change.next);journal.completed.push(change.path);await writeFile(journalPath,json(journal));
    }
    await readProject(root);journal.status='complete';await writeFile(journalPath,json(journal));return {...plan,backup};
  }catch(error){journal.status='partial';journal.error=error.message;await writeFile(journalPath,json(journal));throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const target=process.argv[2];if(!target){console.error('Uso: node scripts/update-project.mjs "C:/caminho/projeto" [--apply]. Sem --apply, apenas mostra o plano.');process.exitCode=1;}
  else try{console.log(json(await updateProject(path.resolve(target),{apply:process.argv.includes('--apply')})));}catch(error){console.error(error.message);process.exitCode=1;}
}
