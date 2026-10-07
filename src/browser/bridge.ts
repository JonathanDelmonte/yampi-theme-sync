import {EditorView} from '@codemirror/view';
import {assertContext, validatePath, validatePaths, writable, MAX_FILE_BYTES, type Context} from '../core/model';
export interface Command {op: 'context' | 'inventory' | 'read' | 'write'; context?: Context; path?: string; expected?: string; content?: string}
export const version = '0.1.0';
type Reply = {ok: true; value: unknown} | {ok: false; error: string};
const clean = (e: Element | null) => e?.textContent?.trim() || '';
function findButton(label: string): HTMLButtonElement {
  const matches = [...document.querySelectorAll<HTMLButtonElement>('main button')].filter(b => clean(b) === label);
  if (matches.length !== 1) throw new Error(`Controle do editor não reconhecido: ${label}`);
  return matches[0];
}
function getContext(): Context {
  const header = document.querySelector('header');
  if (!header || !clean(header).includes('Editor de código')) throw new Error('Abra o editor de código da Yampi.');
  const marker = [...header.children].find(e => clean(e) === 'Editor de código');
  const storeName = clean(marker?.nextElementSibling?.nextElementSibling || null);
  const previews = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a => /Ver prévia|Ver loja/i.test(clean(a)));
  if (!storeName || previews.length !== 1) throw new Error('Não foi possível identificar a loja e a prévia.');
  const preview = new URL(previews[0].href);
  if (!['https:', 'http:'].includes(preview.protocol)) throw new Error('URL de prévia inválida.');
  return {storeName, previewOrigin: preview.origin, editorOrigin: location.origin};
}
function pathFor(file: Element): string {
  const parts = [clean(file)];
  let node = file.parentElement;
  while (node && node.tagName !== 'ASIDE') {
    if (node.classList.contains('collapse-list')) {
      const title = [...node.children].find(c => c.classList.contains('folder-title'));
      const label = title && [...title.children].find(c => c.tagName === 'SPAN');
      if (!label) throw new Error('Pasta sem identificação.');
      parts.unshift(clean(label));
    }
    node = node.parentElement;
  }
  return validatePath(parts.join('/'));
}
function inventory(): Map<string, HTMLElement> {
  const nodes = [...document.querySelectorAll<HTMLElement>('aside .file-name')];
  const paths = nodes.map(pathFor);
  validatePaths(paths);
  return new Map(paths.map((path, i) => [path, nodes[i]]));
}
function view(): EditorView {
  const contents = document.querySelectorAll<HTMLElement>('main .cm-content');
  if (contents.length !== 1) throw new Error('Editor CodeMirror não reconhecido; nenhuma operação realizada.');
  const instance = EditorView.findFromDOM(contents[0]);
  if (!instance) throw new Error('Não foi possível ler o documento completo do CodeMirror.');
  return instance;
}
function dirty(): boolean {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('main button')].filter(b => clean(b) === 'Salvar arquivo');
  return buttons.some(b => !b.disabled) || !!document.querySelector('main .tab-item .holder-icon circle, main .tab-item .unsaved, main .tab-item.dirty');
}
function assertClean(): void {
  if (dirty()) throw new Error('Existe um arquivo com alterações não salvas. Salve ou descarte manualmente antes de continuar.');
}
function guard(context: Context): void {assertContext(context, getContext());}
async function until(check: () => boolean, timeout = 10000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) throw new Error('O editor não confirmou a operação dentro do prazo.');
    await new Promise(r => setTimeout(r, 80));
  }
}
function selectedPath(): string | undefined {
  const selected = document.querySelectorAll('aside .collapse-item.selected .file-name');
  return selected.length === 1 ? pathFor(selected[0]) : undefined;
}
async function open(path: string, context: Context): Promise<void> {
  guard(context);
  assertClean();
  const item = inventory().get(validatePath(path));
  if (!item) throw new Error(`O arquivo não existe na loja: ${path}. A extensão não cria duplicatas.`);
  const parents: HTMLElement[] = [];
  for (let n = item.parentElement; n && n.tagName !== 'ASIDE'; n = n.parentElement) if (n.classList.contains('collapse-list')) parents.unshift(n);
  for (const parent of parents) if (!parent.classList.contains('active')) {
    const title = [...parent.children].find(c => c.classList.contains('folder-title')) as HTMLElement | undefined;
    if (!title) throw new Error('Árvore do editor não reconhecida.');
    title.click();
    await until(() => parent.classList.contains('active'));
  }
  item.click();
  await until(() => {
    guard(context);
    return selectedPath() === path && clean(document.querySelector('main .tab-item.active p')) === path.split('/').pop() && !!document.querySelector('main .cm-content');
  });
  // CodeMirror and the active tab can switch before async file loading finishes. Require stable UI/document.
  let last = '', stable = 0;
  await until(() => {
    guard(context);
    if (selectedPath() !== path || document.querySelector('main [aria-busy="true"], main .loading, main .spinner')) {stable = 0; return false;}
    const value = view().state.doc.toString();
    stable = value === last ? stable + 1 : 0;
    last = value;
    return stable >= 4;
  });
  assertClean();
}
let busy = false;
export async function command(input: Command): Promise<Reply> {
  if (busy) return {ok: false, error: 'O editor já está executando outra operação da extensão.'};
  busy = true;
  try {
    const context = getContext();
    if (input.context) guard(input.context);
    assertClean();
    if (input.op === 'context') return {ok: true, value: context};
    if (input.op === 'inventory') return {ok: true, value: [...inventory().keys()].sort()};
    if (!input.path) throw new Error('Arquivo não informado.');
    await open(input.path, context);
    const editor = view();
    const old = editor.state.doc.toString();
    if (input.op === 'read') return {ok: true, value: old};
    if (input.op !== 'write' || typeof input.content !== 'string' || typeof input.expected !== 'string') throw new Error('Comando inválido.');
    if (!writable(input.path) || new TextEncoder().encode(input.content).length > MAX_FILE_BYTES || input.content.includes('\u0000')) throw new Error('Tipo de arquivo não permitido para envio.');
    if (old !== input.expected) throw new Error(`Conflito antes de salvar: ${input.path}`);
    if (input.content === old) return {ok: true, value: {saved: false}};
    guard(context);
    if (selectedPath() !== input.path) throw new Error('A seleção do editor mudou.');
    editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: input.content}});
    await until(() => !findButton('Salvar arquivo').disabled);
    guard(context);
    if (selectedPath() !== input.path || editor.state.doc.toString() !== input.content) throw new Error('O arquivo foi alterado durante a operação. Gravação interrompida.');
    const save = findButton('Salvar arquivo');
    save.click();
    await until(() => {
      guard(context);
      return save.disabled && !save.querySelector('.loading, .spinner') && !document.querySelector('main [aria-busy="true"]');
    }, 20000);
    // Do not click publish, delete, rename, or create controls. A separate fresh-page verification follows.
    if (view().state.doc.toString() !== input.content) throw new Error('Conteúdo diferente após salvar.');
    return {ok: true, value: {saved: true}};
  } catch (error) {return {ok: false, error: error instanceof Error ? error.message : String(error)};}
  finally {busy = false;}
}
