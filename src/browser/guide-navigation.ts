import {EDITOR_URL} from './toolbar';
export async function openEditorFromGuide(source: string, api: Pick<typeof chrome, 'runtime' | 'sidePanel' | 'tabs'> = chrome): Promise<void> {
  const url = new URL(source);
  const value = url.searchParams.get('tab') || '';
  const tabId = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(tabId) || source !== api.runtime.getURL(`guide.html?tab=${tabId}`)) throw new Error('Abra esta orientação pelo ícone da extensão.');
  const contexts = await api.runtime.getContexts({contextTypes: ['SIDE_PANEL'], documentUrls: [source]});
  if (contexts.length !== 1 || contexts[0].frameId !== 0 || !contexts[0].documentId) throw new Error('Esta orientação não pertence a um painel lateral ativo.');
  const options = await api.sidePanel.getOptions({tabId});
  if (!options.enabled || options.path !== `guide.html?tab=${tabId}`) throw new Error('O painel mudou. Clique novamente no ícone da extensão.');
  // Fixed destination, explicit button click. This page never reads or writes theme files.
  await api.tabs.update(tabId, {url: EDITOR_URL});
}
