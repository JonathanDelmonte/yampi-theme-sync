import type {EditorView} from '@codemirror/view';
import {MAX_FILE_BYTES} from '../core/model';

type EditorContent = HTMLElement & {
  cmView?: {rootView?: {view?: EditorView}};
  cmTile?: {root?: {view?: EditorView}};
};
export function editorView(content: HTMLElement): EditorView {
  // CodeMirror changed its DOM association from cmView/rootView to cmTile/root.
  // Use the page's own constructor/API, not another bundled version of CodeMirror.
  const node = content as EditorContent;
  const candidates = [...new Set([node.cmView?.rootView?.view, node.cmTile?.root?.view].filter((v): v is EditorView => !!v))];
  if (candidates.length !== 1) throw new Error('Não foi possível acessar o documento completo do CodeMirror desta versão. Nenhum conteúdo foi alterado.');
  const view = candidates[0];
  const constructor = view.constructor as typeof EditorView;
  if (typeof constructor.findFromDOM !== 'function' || constructor.findFromDOM(content) !== view || view.contentDOM !== content || view.dom !== content.closest('.cm-editor')) throw new Error('A instância do CodeMirror não corresponde ao arquivo aberto. Cópia interrompida.');
  return view;
}
export function readDocument(view: EditorView): string {
  const doc = view.state.doc;
  if (!Number.isSafeInteger(doc.length) || doc.length < 0 || doc.length > MAX_FILE_BYTES || !Number.isSafeInteger(doc.lines) || doc.lines < 1 || typeof doc.toString !== 'function' || typeof doc.sliceString !== 'function') throw new Error('Documento do editor inválido ou grande demais.');
  // Read the complete immutable text model. Never select, paste, dispatch or edit DOM content.
  const text = doc.toString();
  if (typeof text !== 'string' || text.length !== doc.length || text.split('\n').length !== doc.lines || text !== doc.sliceString(0, doc.length) || new TextEncoder().encode(text).length > MAX_FILE_BYTES || view.state.doc !== doc) throw new Error('O documento mudou ou não pôde ser copiado integralmente. Cópia interrompida.');
  return text;
}
