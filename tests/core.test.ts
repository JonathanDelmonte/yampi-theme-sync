import {describe, test, expect} from 'vitest';
import {zipSync, strToU8} from 'fflate';
import {makePlan} from '../src/core/planner';
import {capture, applyPlan} from '../src/core/workflow';
import {encodeSnapshot, decodeProject} from '../src/core/archive';
import {safeFiles, validatePath, validatePaths, type Context, type Snapshot, type Files, type Adapter, type Journal, type Plan} from '../src/core/model';
const context: Context = {storeName: 'Loja fictícia', editorOrigin: 'https://app.yampi.com.br', previewOrigin: 'https://loja.invalid'};
const snapshot = (files: Files): Snapshot => ({context, capturedAt: '2026-01-01T00:00:00Z', files});
const file = 'templates/home.twig';
describe('comparação entre três versões', () => {
  test.each([
    ['a', 'a', 'a', 'unchanged'], ['a', 'b', 'a', 'update'], ['a', 'a', 'b', 'remote-only'], ['a', 'b', 'b', 'already-applied'], ['a', 'b', 'c', 'conflict']
  ])('%s / %s / %s → %s', (base, local, remote, expected) => {
    expect(makePlan(snapshot({[file]: base}), {[file]: local}, snapshot({[file]: remote})).rows[0].status).toBe(expected);
  });
  test('arquivo ausente localmente é preservado', () => {expect(makePlan(snapshot({[file]: 'a'}), {}, snapshot({[file]: 'a'})).rows[0].status).toBe('missing-local');});
  test('arquivo novo não cria duplicatas', () => {expect(makePlan(snapshot({}), {[file]: 'a'}, snapshot({})).rows[0].status).toBe('new-local');});
  test('arquivo removido na loja não é recriado', () => {expect(makePlan(snapshot({[file]: 'a'}), {[file]: 'b'}, snapshot({})).rows[0].status).toBe('missing-remote');});
  test('md não é enviado pelo adaptador de código', () => {expect(makePlan(snapshot({'assets/images/readme.md': 'a'}), {'assets/images/readme.md': 'b'}, snapshot({'assets/images/readme.md': 'a'})).rows[0].status).toBe('unsupported');});
  test('loja diferente bloqueia o plano', () => {expect(() => makePlan(snapshot({[file]: 'a'}), {[file]: 'b'}, {...snapshot({[file]: 'a'}), context: {...context, previewOrigin: 'https://outra.invalid'}})).toThrow('loja');});
  test('nomes iguais em pastas diferentes são independentes', () => {
    const a = 'elements/head.twig', b = 'elements/header/head.twig';
    const plan = makePlan(snapshot({[a]: 'a', [b]: 'b'}), {[a]: 'novo', [b]: 'b'}, snapshot({[a]: 'a', [b]: 'b'}));
    expect(plan.rows.find(r => r.path === a)?.status).toBe('update'); expect(plan.rows.find(r => r.path === b)?.status).toBe('unchanged');
  });
});
describe('caminhos e arquivos inseguros', () => {
  test.each(['../arquivo.twig', '/templates/home.twig', 'templates/../home.twig', 'templates\\home.twig', 'templates/home.twig:senha', 'templates/CON.twig', 'templates/file .twig ', 'node_modules/x.js', 'templates/./a.twig'])('rejeita %s', path => {expect(() => validatePath(path)).toThrow();});
  test('rejeita duplicatas e colisões de caixa', () => {expect(() => validatePaths(['templates/Home.twig', 'templates/home.twig'])).toThrow('ambíguo');});
  test('rejeita conflito arquivo/pasta', () => {expect(() => validatePaths(['templates/foo', 'templates/foo/bar.twig'])).toThrow('pasta');});
  test('rejeita conteúdo binário e excesso de tamanho', () => {expect(() => safeFiles([[file, '\u0000']])).toThrow('binário'); expect(() => safeFiles([[file, 'a'.repeat(2 * 1024 * 1024 + 1)]])).toThrow('grande');});
});
describe('ZIP e integridade do original', () => {
  test('roundtrip preserva acentos, BOM, linhas e arquivos vazios', async () => {
    const source = snapshot({[file]: '\ufeff{{ "🎮 ação" }}\n', 'assets/styles/main.scss': ''});
    const result = await decodeProject(await encodeSnapshot(source));
    expect(result.baseline).toEqual(source); expect(result.local).toEqual(source.files);
  });
  test('baseline adulterada é rejeitada', async () => {
    const {unzipSync} = await import('fflate');
    const entries = unzipSync(await encodeSnapshot(snapshot({[file]: 'original'})));
    entries[`.yampi-sync/baseline/${file}`] = strToU8('alterado');
    await expect(decodeProject(zipSync(entries))).rejects.toThrow('Baseline');
  });
  test('ZIP sem metadados não é tratado como original', async () => {await expect(decodeProject(zipSync({[file]: strToU8('x')}))).rejects.toThrow('exportado');});
  test('caminho de travessia é rejeitado mesmo fora do tema', async () => {await expect(decodeProject(zipSync({'../x': strToU8('x')}))).rejects.toThrow('inseguro');});
  test('arquivo grande altamente comprimido é rejeitado antes de extrair', async () => {await expect(decodeProject(zipSync({'tema/templates/home.twig': new Uint8Array(5 * 1024 * 1024)}))).rejects.toThrow('limites');});
});
class FakeAdapter implements Adapter {
  files: Files; writes: string[] = []; refreshed = false; ctx = {...context};
  beforeWrite?: (path: string) => void; refreshHook?: () => void;
  constructor(files: Files) {this.files = {...files};}
  async context() {return this.ctx;}
  async inventory() {return Object.keys(this.files);}
  async read(path: string) {if (!(path in this.files)) throw new Error('ausente'); return this.files[path];}
  async write(path: string, expected: string, content: string) {
    this.beforeWrite?.(path);
    if (this.files[path] !== expected) throw new Error('conflito no último momento');
    this.files[path] = content; this.writes.push(path);
  }
  async refresh() {this.refreshed = true; this.refreshHook?.();}
}
function planFor(adapter: FakeAdapter, changes: Files): Plan {return makePlan(snapshot(adapter.files), changes, snapshot(adapter.files));}
function hooks() {
  const events: string[] = [], journals: Journal[] = [];
  return {events, journals, persist: async (j: Journal) => {events.push('persist:' + j.status); journals.push(structuredClone(j));}, backup: async () => {events.push('backup');}};
}
describe('envio com preflight, backup e conferência', () => {
  test('não grava nada antes de persistir o registro e o backup', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}), h = hooks();
    adapter.beforeWrite = () => {expect(h.events).toContain('backup'); expect(h.journals.at(-1)?.pending).toBe(file);};
    const result = await applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file], h);
    expect(result.status).toBe('completed'); expect(adapter.refreshed).toBe(true); expect(result.verified).toEqual([file]); expect(h.journals[0].before[file]).toBe('a');
  });
  test('falha no backup impede toda gravação', async () => {
    const adapter = new FakeAdapter({[file]: 'a'});
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file], {...hooks(), backup: async () => {throw new Error('disco cheio');}})).rejects.toThrow('disco'); expect(adapter.writes).toEqual([]);
  });
  test('falha em persistir impede toda gravação', async () => {
    const adapter = new FakeAdapter({[file]: 'a'});
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file], {...hooks(), persist: async () => {throw new Error('quota');}})).rejects.toThrow('quota'); expect(adapter.writes).toEqual([]);
  });
  test('mudança após comparar bloqueia todos os arquivos no preflight', async () => {
    const other = 'templates/product.twig', adapter = new FakeAdapter({[file]: 'a', [other]: 'a'});
    const plan = planFor(adapter, {[file]: 'b', [other]: 'b'}); adapter.files[other] = 'externo';
    await expect(applyPlan(adapter, plan, [file, other], hooks())).rejects.toThrow('Conflito'); expect(adapter.writes).toEqual([]);
  });
  test('versão antiga em aba aberta não passa pelo preflight após reload', async () => {
    const adapter = new FakeAdapter({[file]: 'versão em cache'}), h = hooks();
    const plan = planFor(adapter, {[file]: 'versão local'});
    adapter.refreshHook = () => {adapter.files[file] = 'versão atual do servidor';};
    await expect(applyPlan(adapter, plan, [file], h)).rejects.toThrow('Conflito');
    expect(adapter.writes).toEqual([]); expect(h.events).toEqual([]);
  });
  test('troca de loja durante reload bloqueia preflight', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}), plan = planFor(adapter, {[file]: 'b'});
    adapter.refreshHook = () => {adapter.ctx.previewOrigin = 'https://outra.invalid';};
    await expect(applyPlan(adapter, plan, [file], hooks())).rejects.toThrow('loja'); expect(adapter.writes).toEqual([]);
  });
  test('mudança imediatamente antes de salvar não é sobrescrita', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}), h = hooks();
    adapter.beforeWrite = p => {adapter.files[p] = 'externo';};
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file], h)).rejects.toThrow('conflito'); expect(adapter.files[file]).toBe('externo'); expect(h.journals.at(-1)?.pending).toBe(file);
  });
  test('mudança de loja impede envio', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}), plan = planFor(adapter, {[file]: 'b'}); adapter.ctx.storeName = 'Outra';
    await expect(applyPlan(adapter, plan, [file], hooks())).rejects.toThrow('loja'); expect(adapter.writes).toEqual([]);
  });
  test('falha no segundo arquivo guarda o primeiro e o arquivo pendente', async () => {
    const other = 'templates/product.twig', adapter = new FakeAdapter({[file]: 'a', [other]: 'a'}), h = hooks();
    adapter.beforeWrite = p => {if (p === other) throw new Error('falha');};
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b', [other]: 'b'}), [file, other], h)).rejects.toThrow('falha');
    expect(h.journals.at(-1)?.verified).toEqual([file]); expect(h.journals.at(-1)?.pending).toBe(other); expect(h.journals.at(-1)?.status).toBe('stopped');
  });
  test('cancelamento para antes do próximo arquivo', async () => {
    const other = 'templates/product.twig', adapter = new FakeAdapter({[file]: 'a', [other]: 'a'}), controller = new AbortController();
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b', [other]: 'b'}), [file, other], {...hooks(), signal: controller.signal, progress: () => controller.abort()})).rejects.toThrow('Cancelado'); expect(adapter.writes).toEqual([file]);
  });
  test('verificação após reload detecta save que não persistiu', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}); adapter.refreshHook = () => {adapter.files[file] = 'a';};
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file], hooks())).rejects.toThrow('não persistiu');
  });
  test('conflitos e caminhos duplicados não podem ser enviados', async () => {
    const adapter = new FakeAdapter({[file]: 'a'});
    await expect(applyPlan(adapter, planFor(adapter, {[file]: 'b'}), [file, file], hooks())).rejects.toThrow('duplicatas');
    const plan = makePlan(snapshot({[file]: 'a'}), {[file]: 'b'}, snapshot({[file]: 'c'}));
    await expect(applyPlan(adapter, plan, [file], hooks())).rejects.toThrow('elegível');
  });
  test('restauração respeita alterações posteriores', () => {
    const restore = makePlan(snapshot({[file]: 'enviado'}), {[file]: 'antes'}, snapshot({[file]: 'terceiro'}));
    expect(restore.rows[0].status).toBe('conflict');
  });
});
describe('captura da árvore inteira', () => {
  test('mantém caminho completo e conteúdo além da viewport', async () => {
    const big = '😀\n'.repeat(10000), adapter = new FakeAdapter({[file]: big, 'elements/head.twig': 'a', 'elements/header/head.twig': 'b'});
    expect((await capture(adapter)).files[file]).toBe(big);
  });
  test('alteração na árvore durante captura impede exportação incompleta', async () => {
    const adapter = new FakeAdapter({[file]: 'a'});
    await expect(capture(adapter, {progress: () => {adapter.files['templates/new.twig'] = 'x';}})).rejects.toThrow('árvore');
  });
  test('cancelamento não entrega snapshot parcial', async () => {
    const adapter = new FakeAdapter({[file]: 'a'}), controller = new AbortController(); controller.abort();
    await expect(capture(adapter, {signal: controller.signal})).rejects.toThrow('Cancelado');
  });
});
