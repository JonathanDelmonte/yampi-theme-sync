import {describe, expect, test, vi} from 'vitest';
import type {EditorView} from '@codemirror/view';
import {editorView, readDocument} from '../src/browser/editor-document';

function sample(text = 'primeira\n🎮 ação\n') {
  const wrapper = {};
  const content = {closest: vi.fn(() => wrapper), cmView: undefined as unknown, cmTile: undefined as unknown};
  const doc = {length: text.length, lines: text.split('\n').length, toString: vi.fn(() => text), sliceString: vi.fn(() => text)};
  const view = {dom: wrapper, contentDOM: content, state: {doc}, dispatch: vi.fn(), constructor: {findFromDOM: vi.fn(() => view)}};
  return {content, doc, view, element: content as unknown as HTMLElement, instance: view as unknown as EditorView};
}
describe('leitura integral do modelo sem editar o arquivo', () => {
  test.each(['cmView', 'cmTile'])('usa a API da instância da página com %s', kind => {
    const s = sample();
    if (kind === 'cmView') s.content.cmView = {rootView: {view: s.view}};
    else s.content.cmTile = {root: {view: s.view}};
    expect(editorView(s.element)).toBe(s.instance);
    expect(readDocument(s.instance)).toBe('primeira\n🎮 ação\n');
    expect(s.view.dispatch).not.toHaveBeenCalled();
  });
  test('não copia texto visível quando o modelo completo está inacessível', () => {
    const s = sample(); Object.assign(s.content, {textContent: 'trecho visível'});
    expect(() => editorView(s.element)).toThrow('documento completo');
    expect(s.view.dispatch).not.toHaveBeenCalled();
  });
  test('recusa associações diferentes no mesmo elemento', () => {
    const s = sample(), other = sample();
    s.content.cmView = {rootView: {view: s.view}}; s.content.cmTile = {root: {view: other.view}};
    expect(() => editorView(s.element)).toThrow('documento completo');
  });
  test.each(['content', 'wrapper', 'api'])('recusa uma instância ligada a outro %s', mismatch => {
    const s = sample(); s.content.cmView = {rootView: {view: s.view}};
    if (mismatch === 'content') s.view.contentDOM = sample().content;
    if (mismatch === 'wrapper') s.view.dom = {};
    if (mismatch === 'api') s.view.constructor.findFromDOM.mockReturnValue(sample().view);
    expect(() => editorView(s.element)).toThrow('não corresponde');
  });
  test('preserva documento vazio, BOM, acentos e linhas finais', () => {
    for (const text of ['', '\ufeffação\n\n', Array.from({length: 2000}, (_, i) => 'Linha ' + (i + 1)).join('\n')]) expect(readDocument(sample(text).instance)).toBe(text);
  });
  test.each(['length', 'lines', 'slice'])('recusa cópia inconsistente com %s', mismatch => {
    const s = sample();
    if (mismatch === 'length') s.doc.length++;
    if (mismatch === 'lines') s.doc.lines++;
    if (mismatch === 'slice') s.doc.sliceString.mockReturnValue('outro texto');
    expect(() => readDocument(s.instance)).toThrow('integralmente');
    expect(s.view.dispatch).not.toHaveBeenCalled();
  });
  test('para se o documento mudar durante a leitura', () => {
    const s = sample(); s.doc.toString.mockImplementation(() => {s.view.state.doc = sample().doc; return 'primeira\n🎮 ação\n';});
    expect(() => readDocument(s.instance)).toThrow('documento mudou');
  });
});
