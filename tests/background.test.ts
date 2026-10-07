import {beforeEach, afterEach, describe, test, expect, vi} from 'vitest';
type Session = {tabId: number; panelId: number; editorUrl: string; locked: boolean};
let clicked: (tab: chrome.tabs.Tab) => Promise<void>;
let listener: (message: unknown, sender: chrome.runtime.MessageSender, response: (value: unknown) => void) => boolean;
let removed: (id: number) => Promise<void>;
let stored: Record<string, Session>;
let tabs: Map<number, {id: number; url: string}>;
let chromeMock: typeof chrome;
let injected: Set<number>;
const extId = 'ficticious-test-extension';
const url = 'https://app.yampi.com.br/store/code-editor/';
function sender(panelId: number): chrome.runtime.MessageSender {return {id: extId, url: `chrome-extension://${extId}/panel.html`, tab: {id: panelId} as chrome.tabs.Tab};}
async function message(session: string, panelId: number, input: Record<string, unknown>) {
  return await new Promise<{ok: boolean; value?: unknown; error?: string}>(resolve => {
    const accepted = listener({session, ...input}, sender(panelId), result => resolve(result as {ok: boolean; value?: unknown; error?: string}));
    if (!accepted) resolve({ok: false, error: 'rejected-sender'});
  });
}
async function open(tabId = 1) {
  await clicked({id: tabId, url} as chrome.tabs.Tab);
  const [token, data] = Object.entries(stored).filter(([, data]) => data.tabId === tabId).at(-1)!;
  return {token, panelId: data.panelId};
}
beforeEach(async () => {
  vi.resetModules(); stored = {}; tabs = new Map([[1, {id: 1, url}], [2, {id: 2, url}]]); injected = new Set();
  chromeMock = {
    runtime: {id: extId, getURL: (path: string) => `chrome-extension://${extId}/${path}`, onMessage: {addListener: vi.fn(fn => {listener = fn;})}},
    action: {onClicked: {addListener: vi.fn(fn => {clicked = fn;})}, setBadgeText: vi.fn(async () => {}), setTitle: vi.fn(async () => {})},
    storage: {session: {
      get: vi.fn(async (key: string | null) => structuredClone(key === null ? stored : {[key]: stored[key]})),
      set: vi.fn(async (values: Record<string, Session>) => {Object.assign(stored, structuredClone(values));}),
      remove: vi.fn(async (key: string) => {delete stored[key];})
    }},
    tabs: {
      create: vi.fn(async ({url}: {url: string}) => {const id = tabs.size + 100; const tab = {id, url}; tabs.set(id, tab); return tab;}),
      get: vi.fn(async (id: number) => {const tab = tabs.get(id); if (!tab) throw new Error('closed'); return tab;}),
      reload: vi.fn(async () => {}), onRemoved: {addListener: vi.fn(fn => {removed = fn;})}
    },
    scripting: {executeScript: vi.fn(async (request: {target: {tabId: number}; files?: string[]; args?: unknown[]}) => {
      if (request.files) {injected.add(request.target.tabId); return [{result: null}];}
      if (!request.args) return [{result: injected.has(request.target.tabId)}];
      return [{result: {ok: true, value: ['templates/home.twig']}}];
    })}
  } as unknown as typeof chrome;
  vi.stubGlobal('chrome', chromeMock);
  await import('../src/browser/background');
});
afterEach(() => {vi.unstubAllGlobals();});
describe('permissões e sessões do worker', () => {
  test('ação fora do editor não abre painel nem injeta código', async () => {
    await clicked({id: 1, url: 'https://outro.invalid/'} as chrome.tabs.Tab);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled(); expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('somente o painel criado para a sessão pode enviar comandos', async () => {
    const s = await open();
    expect((await message(s.token, s.panelId + 1, {action: 'lock'})).ok).toBe(false);
  });
  test('sem lock não lê e não grava', async () => {
    const s = await open(); expect((await message(s.token, s.panelId, {command: {op: 'read', path: 'templates/home.twig'}})).ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('segunda janela fica bloqueada durante a primeira operação', async () => {
    const a = await open(), b = await open();
    expect((await message(a.token, a.panelId, {action: 'lock'})).ok).toBe(true);
    expect((await message(b.token, b.panelId, {action: 'lock'})).error).toContain('Outra janela');
    await message(a.token, a.panelId, {action: 'unlock'});
    expect((await message(b.token, b.panelId, {action: 'lock'})).ok).toBe(true);
  });
  test('pedidos simultâneos não podem adquirir a mesma aba', async () => {
    const a = await open(), b = await open();
    const results = await Promise.all([message(a.token, a.panelId, {action: 'lock'}), message(b.token, b.panelId, {action: 'lock'})]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(Object.values(stored).filter(s => s.locked)).toHaveLength(1);
  });
  test('navegação da aba de origem invalida a sessão', async () => {
    const s = await open(); await message(s.token, s.panelId, {action: 'lock'}); tabs.get(1)!.url = 'https://app.yampi.com.br/store/themes';
    expect((await message(s.token, s.panelId, {command: {op: 'read', path: 'templates/home.twig'}})).error).toContain('origem mudou'); expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('só o comando permitido é enviado ao MAIN world da aba autorizada', async () => {
    const s = await open(); await message(s.token, s.panelId, {action: 'lock'});
    expect((await message(s.token, s.panelId, {command: {op: 'inventory'}})).ok).toBe(true);
    for (const [request] of vi.mocked(chromeMock.scripting.executeScript).mock.calls) {
      expect(request.target.tabId).toBe(1); expect(request.world).toBe('MAIN');
    }
    const calls = vi.mocked(chromeMock.scripting.executeScript).mock.calls.length;
    expect((await message(s.token, s.panelId, {command: {op: 'publish'}})).ok).toBe(false);
    expect(vi.mocked(chromeMock.scripting.executeScript).mock.calls.length).toBe(calls);
  });
  test('fechar painel remove a sessão e libera a aba', async () => {
    const s = await open(); await message(s.token, s.panelId, {action: 'lock'}); await removed(s.panelId);
    expect(stored[s.token]).toBeUndefined();
    const next = await open(); expect((await message(next.token, next.panelId, {action: 'lock'})).ok).toBe(true);
  });
  test('reutiliza adaptador existente sem resetar trava de uma operação em andamento', async () => {
    const s = await open(); await message(s.token, s.panelId, {action: 'lock'});
    await message(s.token, s.panelId, {command: {op: 'inventory'}});
    await message(s.token, s.panelId, {command: {op: 'inventory'}});
    const injections = vi.mocked(chromeMock.scripting.executeScript).mock.calls.filter(([r]) => 'files' in r);
    expect(injections).toHaveLength(1);
  });
});
