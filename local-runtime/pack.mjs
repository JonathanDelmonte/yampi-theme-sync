import path from 'node:path';
import {writeFile, access} from 'node:fs/promises';
import {zipSync, strToU8} from 'fflate';
import {readProject, digest} from './engine.mjs';
export async function packProject(root) {
  const {manifest, baseline, files} = await readProject(root);
  const entries = Object.create(null);
  entries['.yampi-sync/manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  for (const [name, value] of Object.entries(baseline)) entries['.yampi-sync/baseline/' + name] = value;
  for (const [name, value] of Object.entries(files)) entries['tema/' + name] = value;
  return zipSync(entries, {level: 6});
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const root = path.resolve(import.meta.dirname, '../..'), bytes = await packProject(root);
    let name = 'retorno-yampi.zip';
    try {await access(path.join(root, name)); name = `retorno-yampi-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;} catch (error) {if (error.code !== 'ENOENT') throw error;}
    await writeFile(path.join(root, name), bytes, {flag: 'wx'});
    await writeFile(path.join(root, name + '.sha256'), digest(bytes) + '  ' + name + '\n', {flag: 'wx'});
    console.log(`Pronto: ${name}. Importe este ZIP na extensão e compare com a loja.`);
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
