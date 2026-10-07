import type {Command} from './bridge';
type Session = {tabId: number; editorUrl: string; panelId: number | undefined; locked: boolean};
const sessions = new Map<string, Session>();
let sessionQueue = Promise.resolve();
async function serialize<T>(job: () => Promise<T>): Promise<T> {
  const previous = sessionQueue;
  let release!: () => void;
  sessionQueue = new Promise<void>(resolve => {release = resolve;});
  await previous;
  try {return await job();} finally {release();}
}
async function getSession(token: string): Promise<Session | undefined> {
  const live = sessions.get(token);
  if (live) return live;
  const stored = await chrome.storage.session.get(token);
  const value = stored[token] as Session | undefined;
  if (value) sessions.set(token, value);
  return value;
}
function allowed(url?: string): boolean {
  if (!url) return false;
  const u = new URL(url);
  return u.origin === 'https://app.yampi.com.br' && /^\/store\/code-editor\/?$/.test(u.pathname);
}
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !allowed(tab.url)) {
    await chrome.action.setBadgeText({text: 'Yampi', tabId: tab.id});
    await chrome.action.setTitle({title: 'Abra o editor de código em app.yampi.com.br e clique novamente.', tabId: tab.id});
    return;
  }
  const token = crypto.randomUUID();
  const session: Session = {tabId: tab.id, editorUrl: tab.url!, panelId: undefined, locked: false};
  const panel = await chrome.tabs.create({url: chrome.runtime.getURL(`panel.html?session=${token}`)});
  session.panelId = panel.id;
  sessions.set(token, session);
  await chrome.storage.session.set({[token]: session});
  await chrome.action.setBadgeText({text: '', tabId: tab.id});
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('panel.html')) || typeof message?.session !== 'string') return false;
  void (async () => {
    const session = await getSession(message.session);
    if (!session || session.panelId !== sender.tab?.id) throw new Error('Sessão expirada. Clique na extensão dentro do editor novamente.');
    const tab = await chrome.tabs.get(session.tabId);
    if (!allowed(tab.url) || tab.url !== session.editorUrl) throw new Error('A aba de origem mudou. Abra uma nova sessão da extensão.');
    if (message.action === 'lock') {
      return serialize(async () => {
      const all = await chrome.storage.session.get(null);
      if (!all[message.session]) throw new Error('Sessão encerrada. Abra uma nova sessão da extensão.');
      if (Object.entries(all).some(([key, value]) => key !== message.session && (value as Session).tabId === session.tabId && (value as Session).locked)) throw new Error('Outra janela da extensão está trabalhando neste editor.');
      session.locked = true;
      await chrome.storage.session.set({[message.session]: session});
      return null;
      });
    }
    if (message.action === 'unlock') {
      return serialize(async () => {
      session.locked = false;
      if ((await chrome.storage.session.get(message.session))[message.session]) await chrome.storage.session.set({[message.session]: session});
      return null;
      });
    }
    if (!session.locked) throw new Error('Inicie uma operação antes de acessar o editor.');
    if (message.action === 'refresh') {await chrome.tabs.reload(session.tabId); return null;}
    const cmd = message.command as Command;
    if (!cmd || !['context', 'inventory', 'read', 'write'].includes(cmd.op)) throw new Error('Comando não permitido.');
    // Each command completes within a bounded time; export loops live in the panel, not in the suspendable worker.
    const [existing] = await chrome.scripting.executeScript({target: {tabId: session.tabId}, world: 'MAIN', func: () => {
      return (window as unknown as {YampiThemeSyncBridge?: {version?: string}}).YampiThemeSyncBridge?.version === '0.1.0';
    }});
    if (!existing?.result) await chrome.scripting.executeScript({target: {tabId: session.tabId}, world: 'MAIN', files: ['bridge.js']});
    const results = await chrome.scripting.executeScript({target: {tabId: session.tabId}, world: 'MAIN', func: async command => {
      const api = (window as unknown as {YampiThemeSyncBridge: {command: (c: Command) => Promise<unknown>}}).YampiThemeSyncBridge;
      if (!api) throw new Error('Adaptador do editor indisponível.');
      return api.command(command);
    }, args: [cmd]});
    const reply = results[0]?.result as {ok: boolean; value?: unknown; error?: string} | undefined;
    if (!reply?.ok) throw new Error(reply?.error || 'Sem resposta do editor.');
    return reply.value;
  })().then(value => sendResponse({ok: true, value}), error => sendResponse({ok: false, error: error instanceof Error ? error.message : String(error)}));
  return true;
});
chrome.tabs.onRemoved.addListener(async id => {
  await serialize(async () => {
  const stored = await chrome.storage.session.get(null);
  for (const [token, value] of Object.entries(stored)) {
    const session = value as Session;
    if (session.tabId === id || session.panelId === id) {sessions.delete(token); await chrome.storage.session.remove(token);}
  }
  });
});
