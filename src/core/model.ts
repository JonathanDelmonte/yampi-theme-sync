export type Files = Record<string, string>;
export interface Context {
  storeName: string;
  previewOrigin: string;
  editorOrigin: string;
}
export interface Snapshot {
  context: Context;
  capturedAt: string;
  files: Files;
}
export interface FileHash {path: string; sha256: string; bytes: number}
export interface Manifest {
  format: 'yampi-theme-sync';
  version: 1;
  context: Context;
  capturedAt: string;
  files: FileHash[];
}
export type Status = 'update' | 'unchanged' | 'remote-only' | 'already-applied' | 'conflict' | 'missing-local' | 'missing-remote' | 'new-local' | 'unsupported';
export interface PlanRow {path: string; status: Status; base?: string; local?: string; remote?: string}
export interface Plan {context: Context; rows: PlanRow[]; createdAt: string}
export interface Adapter {
  context(): Promise<Context>;
  inventory(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, expected: string, content: string): Promise<void>;
  refresh(): Promise<void>;
}
export interface Progress {done: number; total: number; path: string; phase: string}
export interface Journal {
  version: 1; id: string; context: Context; startedAt: string;
  status: 'prepared' | 'running' | 'completed' | 'stopped';
  selected: string[]; verified: string[]; pending?: string; error?: string;
  before: Files; after: Files;
}
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAX_FILES = 3000;
export const ROOTS = new Set(['assets', 'components', 'elements', 'sections', 'templates']);
export function validatePath(path: string): string {
  if (!path || path.length > 240 || path !== path.normalize('NFC') || /[\\\u0000-\u001f\u007f:<>"|?*]/.test(path)) throw new Error(`Caminho inválido: ${path}`);
  const parts = path.split('/');
  if (parts.length < 2 || !ROOTS.has(parts[0]) || parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error(`Caminho fora do tema ou inseguro: ${path}`);
  return path;
}
export function validatePaths(paths: string[]): void {
  if (paths.length > MAX_FILES) throw new Error('Limite de arquivos excedido.');
  const seen = new Set<string>();
  for (const path of paths) {
    validatePath(path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Caminho duplicado ou ambíguo no Windows: ${path}`);
    seen.add(key);
  }
  // A file cannot also act as a directory for a second entry.
  for (const path of paths) for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) {
    if (seen.has(path.slice(0, i).toLowerCase())) throw new Error(`Arquivo e pasta com o mesmo caminho: ${path}`);
  }
}
export function writable(path: string): boolean {return /\.(twig|vue|css|scss)$/i.test(path)}
export function sameContext(a: Context, b: Context): boolean {
  return a.storeName === b.storeName && a.previewOrigin === b.previewOrigin && a.editorOrigin === b.editorOrigin;
}
export function assertContext(a: Context, b: Context): void {
  if (!sameContext(a, b)) throw new Error('A loja de destino mudou ou não corresponde à exportação. Operação interrompida.');
}
export function validateContext(value: unknown): Context {
  const c = value as Context;
  if (!c || typeof c.storeName !== 'string' || !c.storeName.trim() || c.storeName.length > 200) throw new Error('Identificação da loja inválida.');
  for (const key of ['previewOrigin', 'editorOrigin'] as const) {
    const u = new URL(c[key]);
    if (!['https:', 'http:'].includes(u.protocol) || u.origin !== c[key]) throw new Error('Origem da loja inválida.');
  }
  return {storeName: c.storeName, previewOrigin: c.previewOrigin, editorOrigin: c.editorOrigin};
}
export function safeFiles(entries: [string, string][]): Files {
  validatePaths(entries.map(([p]) => p));
  const result: Files = Object.create(null);
  let size = 0;
  for (const [p, content] of entries) {
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_FILE_BYTES || content.includes('\u0000')) throw new Error(`Arquivo binário ou grande demais: ${p}`);
    size += bytes;
    if (size > MAX_TOTAL_BYTES) throw new Error('O tema ultrapassa o limite de 32 MiB.');
    result[p] = content;
  }
  return result;
}
export async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
