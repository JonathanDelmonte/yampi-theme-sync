import {beforeEach, afterEach, describe, test, expect, vi} from 'vitest';
type Session = {tabId: number; editorUrl: string; documentId?: string; locked: boolean; autoExport: boolean};
let stored: Record<string, Session>, tabs: Map<number, {id: number; url: string}>, contexts: Map<string, chrome.runtime.ExtensionContext>, injected: Set<number>;
let chromeMock: typeof chrome, clicked: (tab: chrome.tabs.Tab) => Promise<void>, removed: (id: number) => Promise<void>;
let listener: (message: unknown, sender: chrome.runtime.MessageSender, response: (r: unknown) => void) => boolean;
let connect: (port: chrome.runtime.Port) => void;
let updated: Set<(id: number, change: {status?: string}) => void>;
const extId = 'fictitious-test-extension', url = 'https://app.yampi.com.br/store/code-editor/';
function sender(token: string, documentId?: string): chrome.runtime.MessageSender {
  return {id: extId, url: `chrome-extension://${extId}/panel.html?tab=${stored[token]?.tabId || 1}`, documentId};
}
async function message(token: string, input: Record<string, unknown>, source = sender(token)) {
  return new Promise<{ok: boolean; value?: unknown; error?: string}>(resolve => {
    const accepted = listener({session: token, ...input}, source, result => resolve(result as {ok: boolean; value?: unknown; error?: string}));
    if (!accepted) resolve({ok: false, error: 'rejected-sender'});
  });
}
function context(token: string, doc = `doc-${token}`, type = 'SIDE_PANEL') {
  contexts.set(doc, {contextType: type, documentId: doc, documentUrl: sender(token).url!, frameId: 0} as chrome.runtime.ExtensionContext);
}
async function open(tabId = 1) {
  await clicked({id: tabId, url} as chrome.tabs.Tab);
  const [token] = Object.entries(stored).filter(([, s]) => s.tabId === tabId).at(-1)!;
  context(token); return token;
}
function port(token: string) {
  let disconnect!: () => void;
  connect({name: `panel:${token}`, sender: sender(token), onDisconnect: {addListener: (fn: () => void) => {disconnect = fn;}}} as unknown as chrome.runtime.Port);
  return () => {contexts.delete(`doc-${token}`); disconnect();};
}
beforeEach(async () => {
  vi.resetModules(); stored = {}; tabs = new Map([[1, {id: 1, url}], [2, {id: 2, url}]]); contexts = new Map(); injected = new Set(); updated = new Set();
  chromeMock = {
    runtime: {id: extId, getURL: (p: string) => `chrome-extension://${extId}/${p}`, sendMessage: vi.fn(async () => {}),
      getContexts: vi.fn(async (filter: {documentIds?: string[]; contextTypes?: string[]; documentUrls?: string[]}) => [...contexts.values()].filter(c => (!filter.documentIds || filter.documentIds.includes(c.documentId!)) && (!filter.documentUrls || filter.documentUrls.includes(c.documentUrl!)) && (!filter.contextTypes || filter.contextTypes.includes(c.contextType)))),
      onMessage: {addListener: vi.fn(fn => {listener = fn;})}, onConnect: {addListener: vi.fn(fn => {connect = fn;})}},
    action: {onClicked: {addListener: vi.fn(fn => {clicked = fn;})}, setBadgeText: vi.fn(async () => {}), setTitle: vi.fn(async () => {})},
    sidePanel: {open: vi.fn(async () => {}), setOptions: vi.fn(async () => {})},
    storage: {session: {
      get: vi.fn(async (key: string | null) => structuredClone(key === null ? stored : {[key]: stored[key]})),
      set: vi.fn(async (values: Record<string, Session>) => {Object.assign(stored, structuredClone(values));}),
      remove: vi.fn(async (key: string) => {delete stored[key];})}},
    tabs: {create: vi.fn(), get: vi.fn(async (id: number) => {const tab = tabs.get(id); if (!tab) throw new Error('closed'); return tab;}),
      reload: vi.fn(async (id: number) => {for (const fn of updated) {fn(id, {status: 'loading'}); fn(id, {status: 'complete'});}}),
      onUpdated: {addListener: vi.fn(fn => updated.add(fn)), removeListener: vi.fn(fn => updated.delete(fn))}, onRemoved: {addListener: vi.fn(fn => {removed = fn;})}},
    scripting: {executeScript: vi.fn(async (request: {target: {tabId: number}; files?: string[]; args?: unknown[]}) => {
      if (request.files) {injected.add(request.target.tabId); return [{result: null}];}
      if (!request.args) return [{result: injected.has(request.target.tabId)}];
      return [{result: {ok: true, value: ['templates/home.twig']}}];})}
  } as unknown as typeof chrome;
  vi.stubGlobal('chrome', chromeMock); await import('../src/browser/background');
});
afterEach(() => {vi.unstubAllGlobals();});
describe('painel lateral, permissões e isolamento do editor', () => {
  test('fora do editor não abre painel e não injeta código', async () => {
    await clicked({id: 1, url: 'https://outro.invalid/'} as chrome.tabs.Tab);
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled(); expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('abre painel nativo antes de esperar storage, sem criar outra aba', async () => {
    const opening = clicked({id: 1, url} as chrome.tabs.Tab);
    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({tabId: 1});
    expect(chromeMock.storage.session.get).not.toHaveBeenCalled();
    await opening; expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.sidePanel.setOptions).toHaveBeenCalledWith(expect.objectContaining({tabId: 1, enabled: true}));
  });
  test('erro da API do painel fica no ícone, sem abrir uma aba alternativa', async () => {
    vi.mocked(chromeMock.sidePanel.open).mockRejectedValueOnce(new Error('Painel indisponível'));
    await clicked({id: 1, url} as chrome.tabs.Tab);
    expect(chromeMock.action.setTitle).toHaveBeenCalledWith({tabId: 1, title: 'Painel indisponível'}); expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
  test('uma aba ou iframe que imita o painel não pode acessar o editor', async () => {
    const token = await open();
    expect((await message(token, {action: 'lock'}, {...sender(token), tab: {id: 100} as chrome.tabs.Tab})).ok).toBe(false);
    expect((await message(token, {action: 'lock'}, {...sender(token), frameId: 2})).ok).toBe(false);
    context(token, `doc-${token}`, 'TAB');
    expect((await message(token, {action: 'lock'})).ok).toBe(false);
    context(token); contexts.get(`doc-${token}`)!.frameId = 2;
    expect((await message(token, {action: 'lock'})).ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('rejeita token divergente e documento de outro painel', async () => {
    const token = await open();
    expect((await message(token, {action: 'lock'}, {...sender(token), url: `chrome-extension://${extId}/panel.html?tab=outro`})).ok).toBe(false);
    await message(token, {action: 'lock'}); context(token, 'another-document');
    expect((await message(token, {action: 'lock'}, sender(token, 'another-document'))).error).toContain('Outro painel');
  });
  test('exportação automática é consumida só uma vez, inclusive simultaneamente', async () => {
    const token = await open(); const replies = await Promise.all([message(token, {action: 'auto-export'}), message(token, {action: 'auto-export'})]);
    expect(replies.map(r => r.value).sort()).toEqual([false, true]);
    expect((await message(token, {action: 'auto-export'})).value).toBe(false);
  });
  test('sem lock não lê e não grava', async () => {
    const token = await open(); expect((await message(token, {command: {op: 'write'}})).ok).toBe(false); expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('novo clique durante operação reutiliza a sessão', async () => {
    const token = await open(); await message(token, {action: 'lock'});
    expect(await open()).toBe(token); expect(Object.keys(stored)).toHaveLength(1);
    await message(token, {action: 'unlock'}); await message(token, {action: 'auto-export'}); expect(await open()).toBe(token);
    expect(stored[token].autoExport).toBe(true);
  });
  test('handshake identifica só a sessão da aba indicada pelo painel nativo', async () => {
    const a = await open(), b = await open(2);
    expect((await message(a, {action: 'session'})).value).toBe(a);
    expect((await message(b, {action: 'session'})).value).toBe(b);
    expect((await message(a, {action: 'lock'}, sender(b))).error).toContain('outra aba');
  });
  test('abas de lojas diferentes conservam sessões independentes', async () => {
    const a = await open(), b = await open(2);
    expect((await message(a, {action: 'lock'})).ok).toBe(true); expect((await message(b, {action: 'lock'})).ok).toBe(true);
    await message(b, {command: {op: 'inventory'}});
    expect(vi.mocked(chromeMock.scripting.executeScript).mock.calls.every(([r]) => r.target.tabId === 2)).toBe(true);
  });
  test('refresh aguarda loading e complete, ignorando complete antigo', async () => {
    const token = await open(); await message(token, {action: 'lock'}); let response = false;
    vi.mocked(chromeMock.tabs.reload).mockImplementation(async () => {});
    const wait = message(token, {action: 'refresh'}).then(value => {response = true; return value;});
    await vi.waitFor(() => expect(updated.size).toBe(1));
    for (const fn of updated) fn(1, {status: 'complete'});
    await Promise.resolve(); expect(response).toBe(false);
    for (const fn of updated) {fn(1, {status: 'loading'}); fn(1, {status: 'complete'});}
    expect((await wait).ok).toBe(true); expect(updated.size).toBe(0);
  });
  test('navegação da origem invalida a sessão', async () => {
    const token = await open(); await message(token, {action: 'lock'}); tabs.get(1)!.url = 'https://app.yampi.com.br/store/themes';
    expect((await message(token, {command: {op: 'inventory'}})).error).toContain('origem mudou'); expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
  test('somente comandos permitidos no MAIN world, sem publicação', async () => {
    const token = await open(); await message(token, {action: 'lock'}); await message(token, {command: {op: 'inventory'}});
    expect(vi.mocked(chromeMock.scripting.executeScript).mock.calls.every(([r]) => r.target.tabId === 1 && r.world === 'MAIN')).toBe(true);
    const calls = vi.mocked(chromeMock.scripting.executeScript).mock.calls.length;
    expect((await message(token, {command: {op: 'publish'}})).ok).toBe(false); expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(calls);
  });
  test('adaptador existente não é reinjetado durante uma operação', async () => {
    const token = await open(); await message(token, {action: 'lock'});
    await message(token, {command: {op: 'inventory'}}); await message(token, {command: {op: 'inventory'}});
    expect(vi.mocked(chromeMock.scripting.executeScript).mock.calls.filter(([r]) => 'files' in r)).toHaveLength(1);
  });
  test('fechar painel espera a gravação pendente antes de liberar a sessão', async () => {
    const token = await open(); const close = port(token); await message(token, {action: 'lock'});
    let finish!: () => void;
    vi.mocked(chromeMock.scripting.executeScript).mockImplementationOnce(() => new Promise(resolve => {finish = () => resolve([{result: true}]);}));
    const writing = message(token, {command: {op: 'write', path: 'templates/home.twig'}});
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); close(); await Promise.resolve(); expect(stored[token].locked).toBe(true);
    finish(); await writing; await vi.waitFor(() => expect(stored[token].locked).toBe(false)); expect(stored[token].documentId).toBeUndefined();
  });
  test('fechar editor remove a sessão', async () => {
    const token = await open(); await removed(1); expect(stored[token]).toBeUndefined();
    expect((await message(token, {action: 'lock'})).ok).toBe(false);
  });
});
