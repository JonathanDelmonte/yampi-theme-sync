import {zipSync, unzipSync, strToU8} from 'fflate';
import {MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES, ROOTS, safeFiles, sha256, validateContext, type Snapshot, type Manifest, type Files} from './model';
const metaPath = '.yampi-sync/manifest.json';
export async function encodeSnapshot(snapshot: Snapshot): Promise<Uint8Array> {
  const files = safeFiles(Object.entries(snapshot.files));
  const manifest: Manifest = {format: 'yampi-theme-sync', version: 1, context: validateContext(snapshot.context), capturedAt: snapshot.capturedAt, files: []};
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const path of Object.keys(files).sort()) {
    const bytes = strToU8(files[path]);
    entries[`tema/${path}`] = bytes;
    entries[`.yampi-sync/baseline/${path}`] = bytes;
    manifest.files.push({path, sha256: await sha256(files[path]), bytes: bytes.length});
  }
  entries[metaPath] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(entries, {level: 6});
}
function unzipSafe(data: Uint8Array): Record<string, Uint8Array> {
  if (data.length > MAX_TOTAL_BYTES * 2) throw new Error('ZIP muito grande.');
  const names = new Set<string>();
  let total = 0;
  return unzipSync(data, {filter(file) {
    if (names.has(file.name)) throw new Error(`Entrada duplicada no ZIP: ${file.name}`);
    names.add(file.name);
    if (names.size > MAX_FILES * 2 + 20 || file.originalSize > MAX_FILE_BYTES * 2 || (total += file.originalSize) > MAX_TOTAL_BYTES * 2 + MAX_FILE_BYTES) throw new Error('ZIP ultrapassa os limites de extração.');
    if (/[\\\u0000-\u001f]/.test(file.name) || file.name.startsWith('/') || file.name.split('/').some(p => p === '..' || p === '.')) throw new Error(`Caminho inseguro no ZIP: ${file.name}`);
    return !file.name.endsWith('/');
  }});
}
const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
function text(data: Uint8Array): string {return decoder.decode(data)}
export async function decodeProject(data: Uint8Array): Promise<{baseline: Snapshot; local: Files}> {
  const archive = unzipSafe(data);
  const meta = archive[metaPath];
  if (!meta) throw new Error('Use um ZIP exportado por esta extensão, com .yampi-sync/manifest.json.');
  const m = JSON.parse(text(meta)) as Manifest;
  if (m.format !== 'yampi-theme-sync' || m.version !== 1 || !Array.isArray(m.files) || typeof m.capturedAt !== 'string') throw new Error('Formato de exportação não reconhecido.');
  const context = validateContext(m.context);
  const bases: [string, string][] = [];
  for (const f of m.files) {
    const value = archive[`.yampi-sync/baseline/${f.path}`];
    if (!value || value.length !== f.bytes || await sha256(text(value)) !== f.sha256) throw new Error(`Baseline ausente ou alterada: ${f.path}`);
    bases.push([f.path, text(value)]);
  }
  const baseline: Snapshot = {context, capturedAt: m.capturedAt, files: safeFiles(bases)};
  const local = safeFiles(Object.entries(archive).filter(([p]) => p.startsWith('tema/')).map(([p, v]) => [p.slice(5), text(v).replace(/\r\n?/g, '\n')]));
  if (!Object.keys(baseline.files).length) throw new Error('A exportação não contém arquivos.');
  return {baseline, local};
}
export async function readDirectory(files: FileList | File[]): Promise<Files> {
  const entries: [string, string][] = [];
  let bytes = 0;
  for (const file of Array.from(files)) {
    const full = file.webkitRelativePath || file.name;
    // Directory picker includes the selected directory name. Select the theme directory itself.
    const parts = full.split('/');
    const relative = parts.slice(1).join('/');
    if (!ROOTS.has(relative.split('/')[0])) throw new Error(`Selecione a pasta tema (assets, components, elements, sections e templates). Arquivo fora do tema: ${full}`);
    bytes += file.size;
    if (file.size > MAX_FILE_BYTES || bytes > MAX_TOTAL_BYTES || entries.length >= MAX_FILES) throw new Error('A pasta ultrapassa os limites de importação.');
    entries.push([relative, text(new Uint8Array(await file.arrayBuffer())).replace(/\r\n?/g, '\n')]);
  }
  if (!entries.length) throw new Error('Pasta vazia.');
  return safeFiles(entries);
}
