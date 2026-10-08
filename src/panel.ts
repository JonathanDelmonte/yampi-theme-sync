import {BrowserAdapter, type RPC} from './browser/adapter';
import {PanelConnection} from './browser/panel-connection';
import {capture, applyPlan} from './core/workflow';
import {encodeSnapshot, decodeProject, readProjectDirectory} from './core/archive';
import {makePlan} from './core/planner';
import {assertContext, MAX_TOTAL_BYTES, MAX_FILE_BYTES, type Assets, type Snapshot, type Files, type Plan, type PlanRow, type Journal, type Progress} from './core/model';
import {put, get, clearLocal, saveJournal, journalHistory, contextKey} from './storage';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const isDemo = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
let session: string | undefined;
const editorTab = new URLSearchParams(location.search).get('tab');
let baseline: Snapshot | undefined, local: Files | undefined, plan: Plan | undefined, journal: Journal | undefined;
let working = false, connected = false, controller: AbortController | undefined;
let localAssets: Assets = {}, history: Journal[] = [];
const selected = new Set<string>();
let rpc: RPC;
let connection: PanelConnection | undefined;
if (isDemo) {
  $('demo-notice').hidden = false;
  $('fixture').hidden = false;
  const frame = $<HTMLIFrameElement>('fixture-frame');
  frame.src = 'fixture.html';
  await new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), {once: true}));
  rpc = async request => {
    if (request.action === 'lock' || request.action === 'unlock') return null;
    if (request.action === 'refresh') {
      await new Promise<void>(resolve => {frame.addEventListener('load', () => resolve(), {once: true}); frame.contentWindow!.location.reload();});
      return null;
    }
    const api = (frame.contentWindow as unknown as {YampiThemeSyncBridge: {command: (r: unknown) => Promise<{ok: boolean; value: unknown; error?: string}>}}).YampiThemeSyncBridge;
    const reply = await api.command(request.command);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  };
} else {
  connection = new PanelConnection(chrome.runtime, () => {
    const wasConnected = connected; connected = false;
    controller?.abort(); $('connection-dot').classList.remove('connected');
    // Preserve the precise initial diagnostic instead of replacing it with a generic disconnect.
    if (wasConnected && !working) status('Conexão encerrada', 'Clique em Tentar conectar novamente. Nenhum envio será retomado automaticamente.', true);
    controls();
  });
  rpc = connection.request;
  window.addEventListener('pagehide', () => connection?.close());
}
const adapter = new BrowserAdapter(rpc);
function mode(importing: boolean): void {
  $('export-section').hidden = importing; $('import-section').hidden = !importing;
  $('mode-export').setAttribute('aria-pressed', String(!importing)); $('mode-import').setAttribute('aria-pressed', String(importing));
  $('review').hidden = !importing || !plan; $('send-section').hidden = !importing || !plan || !selected.size;
  if (!importing) $('diff').hidden = true;
}
$('mode-export').addEventListener('click', () => mode(false));
for (const id of ['mode-import', 'go-import']) $(id).addEventListener('click', () => mode(true));
if (isDemo) $('demo-local').addEventListener('click', () => {
  if (working || !baseline) {status('Exporte a loja fictícia primeiro.'); return;}
  const sample = {...baseline.files};
  sample['elements/head.twig'] += '<!-- Redesign local -->\n';
  sample['sections/home/main_banner.twig'] += '<!-- Banner revisado -->\n';
  sample['assets/styles/global/main.scss'] += 'body { background: white; }\n';
  sample['assets/images/readme.md'] += 'Mudança não suportada\n';
  sample['templates/new.twig'] = '<p>Novo</p>\n';
  setLocal(sample, baseline.assets); controls(); status('Alterações fictícias carregadas', 'Amostra com alterações de código, um arquivo novo e um tipo sem suporte.');
});
function status(text: string, detail = '', error = false): void {
  $('status').textContent = text; $('detail').textContent = detail;
  document.querySelector('.activity')!.classList.toggle('error', error);
}
function progress(p: Progress): void {
  const bar = $<HTMLProgressElement>('progress');
  bar.hidden = false; bar.max = p.total; bar.value = p.done;
  status(`${p.phase} · ${p.done}/${p.total}`, p.path);
}
function controls(): void {
  $('export').toggleAttribute('disabled', working || !connected);
  $('compare').toggleAttribute('disabled', working || !connected || !baseline || !local);
  $('apply').toggleAttribute('disabled', working || !connected || !plan || !selected.size || $<HTMLInputElement>('confirm-store').value !== plan.context.storeName);
  for (const id of ['baseline', 'folder', 'confirm-store', 'clear', 'filter', 'demo-local', 'history', 'download-journal', 'retry', 'mode-export', 'mode-import', 'go-import']) $(id).toggleAttribute('disabled', working);
  $('retry').hidden = connected || !editorTab && !isDemo;
  $('restore').toggleAttribute('disabled', working || !connected || !journal);
  $('download-backup').toggleAttribute('disabled', working || !journal);
  $('download-journal').toggleAttribute('disabled', working || !journal);
  $('cancel').hidden = !working;
  document.querySelectorAll<HTMLInputElement>('#rows input').forEach(input => {
    const path = input.getAttribute('aria-label')?.slice(7);
    input.disabled = working || plan?.rows.find(r => r.path === path)?.status !== 'update';
  });
}
async function run(job: () => Promise<void>, needsEditor = true, prepare?: () => Promise<void>, access: 'read' | 'write' = 'read'): Promise<void> {
  if (working) return;
  working = true; controller = new AbortController(); controls();
  let locked = false;
  try {await prepare?.(); if (needsEditor) {await rpc({action: 'lock', access}); locked = true;} await job();}
  catch (error) {status('Operação interrompida', error instanceof Error ? error.message : String(error), true);}
  finally {
    if (locked) await rpc({action: 'unlock'}).catch(() => {});
    working = false; controller = undefined; $('progress').hidden = true; controls();
  }
}
function fileName(prefix: string, storeName = baseline?.context.storeName || 'tema'): string {
  const store = storeName.normalize('NFKD').replace(/[^\w-]+/g, '-').toLowerCase();
  return `${prefix}-${store}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
}
async function download(bytes: Uint8Array, name: string, type = 'application/zip'): Promise<void> {
  const blob = new Blob([new Uint8Array(bytes)], {type});
  const url = URL.createObjectURL(blob);
  try {
    if (isDemo) {
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      // The demo has no browser download API. IndexedDB backup is still persisted before saving.
      await new Promise(r => setTimeout(r, 100));
    } else {
      const id = await chrome.downloads.download({url, filename: name, saveAs: false, conflictAction: 'uniquify'});
      const start = Date.now();
      for (;;) {
        const [item] = await chrome.downloads.search({id});
        if (item?.state === 'complete') break;
        if (item?.state === 'interrupted') throw new Error('Download cancelado ou interrompido. Nenhum envio foi iniciado.');
        if (Date.now() - start > 120000) throw new Error('O download do backup não foi confirmado. Nenhum envio foi iniciado.');
        await new Promise(r => setTimeout(r, 250));
      }
    }
  } finally {URL.revokeObjectURL(url);}
}
function setBaseline(snapshot: Snapshot): void {
  baseline = snapshot; plan = undefined; selected.clear(); $('review').hidden = true; $('diff').hidden = true; $('send-section').hidden = true;
  const images = Object.keys(snapshot.assets || {}).length;
  $('baseline-info').textContent = `${Object.keys(snapshot.files).length} textos e ${images} ${images === 1 ? 'imagem' : 'imagens'} · ${snapshot.context.storeName} · ${new Date(snapshot.capturedAt).toLocaleString('pt-BR')}`;
}
function setLocal(files: Files, assets: Assets = {}): void {
  local = files; localAssets = assets; plan = undefined; selected.clear(); $('review').hidden = true; $('diff').hidden = true; $('send-section').hidden = true;
  const images = Object.keys(assets).length;
  $('local-info').textContent = `${Object.keys(files).length} textos e ${images} ${images === 1 ? 'imagem' : 'imagens'} carregados do computador.`;
}
const labels: Record<PlanRow['status'], string> = {
  update: 'Pronto para envio', unchanged: 'Sem alterações', 'remote-only': 'Mudou apenas na loja', 'already-applied': 'Já está na loja', conflict: 'Conflito', 'missing-local': 'Ausente localmente · preservado', 'missing-remote': 'Removido na loja · bloqueado', 'new-local': 'Novo arquivo · bloqueado', unsupported: 'Tipo sem suporte · bloqueado'
};
function showDiff(row: PlanRow): void {
  $('diff-title').textContent = row.path;
  for (const [kind, id] of [['base', 'diff-base'], ['local', 'diff-local'], ['remote', 'diff-remote']] as const) {
    if (row.image) {
      const bytes = row.image[kind];
      $(id).textContent = bytes ? `Imagem · ${bytes.length} bytes. Imagens alteradas não são enviadas nesta versão.` : '(ausente)';
    } else $(id).textContent = row[kind] ?? '(ausente)';
  }
  $('diff').hidden = false; $('diff').scrollIntoView({behavior: 'smooth', block: 'nearest'});
}
function renderPlan(): void {
  if (!plan) return;
  const filter = $<HTMLSelectElement>('filter').value;
  $('rows').replaceChildren();
  const counts = plan.rows.reduce((map, row) => {map[row.status] = (map[row.status] || 0) + 1; return map;}, {} as Record<string, number>);
  $('summary').textContent = `${selected.size} selecionados · ${counts.update || 0} prontos · ${counts.conflict || 0} conflitos · ${plan.rows.length} caminhos comparados`;
  for (const row of plan.rows) {
    if (filter === 'changes' && ['unchanged', 'already-applied', 'missing-local'].includes(row.status)) continue;
    if (filter === 'update' && row.status !== 'update' || filter === 'conflict' && row.status !== 'conflict') continue;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label', `Enviar ${row.path}`);
    checkbox.disabled = row.status !== 'update' || working; checkbox.checked = selected.has(row.path);
    checkbox.addEventListener('change', () => {checkbox.checked ? selected.add(row.path) : selected.delete(row.path); renderPlan(); controls();});
    td.append(checkbox);
    const pathCell = document.createElement('td'); pathCell.className = 'path'; pathCell.textContent = row.path;
    const result = document.createElement('td'), badge = document.createElement('span'); badge.className = `badge ${row.status}`; badge.textContent = labels[row.status]; result.append(badge);
    const action = document.createElement('td'), button = document.createElement('button'); button.textContent = 'Ver versões'; button.addEventListener('click', () => showDiff(row)); action.append(button);
    tr.append(td, pathCell, result, action); $('rows').append(tr);
  }
  $('review').hidden = false;
  $('send-section').hidden = !selected.size;
  $('target-store').textContent = plan.context.storeName; $('confirm-name').textContent = plan.context.storeName;
}
async function compare(): Promise<void> {
  if (!baseline || !local) throw new Error('Carregue a exportação original e a pasta editada.');
  status('Relendo o estado atual da loja…');
  await adapter.refresh();
  const remote = await capture(adapter, {signal: controller?.signal, progress});
  plan = makePlan(baseline, local, remote, localAssets);
  selected.clear(); plan.rows.filter(r => r.status === 'update').forEach(r => selected.add(r.path));
  $<HTMLInputElement>('confirm-store').value = '';
  renderPlan(); status('Comparação concluída', selected.size ? `${selected.size} ${selected.size === 1 ? 'arquivo pode ser enviado' : 'arquivos podem ser enviados'}. Revise as versões e confirme a loja.` : 'Nenhuma alteração pode ser enviada. Confira os resultados da comparação abaixo.');
}
function journalInfo(): void {
  $('journal-info').textContent = journal ? `${journal.verified.length}/${journal.selected.length} arquivos conferidos · ${journal.status === 'completed' ? 'concluído' : 'envio interrompido ou pendente'} · ${new Date(journal.startedAt).toLocaleString('pt-BR')}` : 'Nenhum envio nesta instalação.';
}
async function updateHistory(): Promise<void> {
  if (!journal) return;
  history = await journalHistory(journal.context);
  const picker = $<HTMLSelectElement>('history'); picker.replaceChildren();
  for (const item of history) {
    const option = document.createElement('option'); option.value = item.id;
    option.textContent = `${new Date(item.startedAt).toLocaleString('pt-BR')} · ${item.status} · ${item.verified.length}/${item.selected.length}`;
    picker.append(option);
  }
  picker.value = journal.id;
}
async function exportProject(): Promise<void> {
  status('Extraindo os arquivos da loja…', 'Mantenha o editor aberto. O ZIP será baixado ao concluir a leitura.');
  const snapshot = await capture(adapter, {signal: controller?.signal, progress});
  const bytes = await encodeSnapshot(snapshot, true);
  await put(`baseline:${await contextKey(snapshot.context)}`, snapshot);
  await download(bytes, fileName('exportacao', snapshot.context.storeName));
  setBaseline(snapshot); status('ZIP da loja baixado', 'Extraia o ZIP em uma pasta do computador. Abra “Como editar no computador” abaixo para iniciar a prévia local. Depois de editar, escolha “Enviar alterações”.');
}
$('export').addEventListener('click', () => void run(exportProject));
$('baseline').addEventListener('change', () => void run(async () => {
  const file = $<HTMLInputElement>('baseline').files?.[0]; if (!file) return;
  if (file.size > MAX_TOTAL_BYTES * 2 + MAX_FILE_BYTES) throw new Error('ZIP muito grande.');
  status('Conferindo a exportação original…');
  const project = await decodeProject(new Uint8Array(await file.arrayBuffer()));
  if (connected) assertContext(project.baseline.context, await adapter.context());
  setBaseline(project.baseline); setLocal(project.local, project.localAssets); await put(`baseline:${await contextKey(project.baseline.context)}`, project.baseline);
  mode(true);
  if (connected) await compare();
  else status('Projeto ZIP carregado', 'Conecte ao editor para comparar e enviar as alterações.');
}, connected));
$('folder').addEventListener('change', () => void run(async () => {
  const files = $<HTMLInputElement>('folder').files; if (!files?.length) return;
  status('Lendo os arquivos locais…');
  const project = await readProjectDirectory(files);
  if ('baseline' in project) {
    if (connected) assertContext(project.baseline.context, await adapter.context());
    setBaseline(project.baseline); await put(`baseline:${await contextKey(project.baseline.context)}`, project.baseline);
  }
  setLocal(project.local, project.localAssets); mode(true);
  if (connected) await compare();
  else status('Pasta local carregada', 'Conecte ao editor para comparar e enviar as alterações.');
}, connected));
$('compare').addEventListener('click', () => void run(compare));
$('confirm-store').addEventListener('input', controls);
$('filter').addEventListener('change', renderPlan);
$('close-diff').addEventListener('click', () => {$('diff').hidden = true;});
$('cancel').addEventListener('click', () => {controller?.abort(); status('Interrupção solicitada', 'A operação para após conferir o arquivo em andamento.');});
$('apply').addEventListener('click', () => void run(async () => {
  if (!plan || $<HTMLInputElement>('confirm-store').value !== plan.context.storeName) throw new Error('Confirme o nome da loja antes de enviar.');
  const current = plan;
  // Freeze selection and invalidate the plan; retries always require another comparison.
  const chosen = [...selected]; plan = undefined; selected.clear(); $('send-section').hidden = true;
  await applyPlan(adapter, current, chosen, {
    signal: controller?.signal, progress,
    persist: async value => {await saveJournal(value); journal = structuredClone(value); journalInfo(); await updateHistory();},
    backup: async value => {const zip = await encodeSnapshot(value); await put(`backup:${journal!.id}`, {journalId: journal!.id, bytes: zip}); await download(zip, fileName('backup-antes-do-envio'));}
  });
  $('review').hidden = true; $('diff').hidden = true;
  status('Arquivos salvos e conferidos após recarregar', 'Abra Ver prévia na Yampi e valide a loja. A extensão não publicou as alterações.');
}, true, undefined, 'write'));
$('download-backup').addEventListener('click', () => void run(async () => {
  const stored = await get<{journalId: string; bytes: Uint8Array}>(`backup:${journal?.id}`);
  if (!stored || stored.journalId !== journal?.id) throw new Error('O backup deste envio não foi concluído. Consulte o registro ou a exportação original.');
  await download(stored.bytes, fileName('backup')); status('Backup baixado');
}, false));
$('history').addEventListener('change', () => {journal = history.find(j => j.id === $<HTMLSelectElement>('history').value); journalInfo(); controls();});
$('download-journal').addEventListener('click', () => void run(async () => {
  if (!journal) throw new Error('Selecione um envio no histórico.');
  await download(new TextEncoder().encode(JSON.stringify(journal, null, 2)), `registro-${journal.id}.json`, 'application/json');
  status('Registro do envio baixado', 'Contém versões anteriores, propostas e caminhos pendentes para recuperação. Guarde fora do repositório.');
}, false));
$('restore').addEventListener('click', () => void run(async () => {
  if (!journal) return;
  setBaseline({context: journal.context, capturedAt: journal.startedAt, files: journal.after});
  setLocal(journal.before); mode(true); await compare();
  status('Restauração preparada para revisão', 'Apenas arquivos ainda iguais ao último envio poderão voltar ao estado anterior. Alterações posteriores ficam como conflitos.');
}));
$('clear').addEventListener('click', async () => {
  if (!confirm('Apagar as cópias originais e o último backup guardados nesta extensão? Os ZIPs já baixados continuam no computador. Nenhum arquivo da loja será alterado.')) return;
  await clearLocal(); baseline = undefined; local = undefined; localAssets = {}; plan = undefined; journal = undefined; history = []; $('history').replaceChildren(); selected.clear();
  $('review').hidden = true; $('diff').hidden = true; $('send-section').hidden = true; $('baseline-info').textContent = 'Nenhuma exportação concluída.'; $('local-info').textContent = 'Nenhum projeto editado selecionado.';
  journalInfo(); status('Dados locais da extensão apagados'); controls();
});
async function connect(): Promise<void> {
  if (working) return;
  connected = false; $('connection-dot').classList.remove('connected');
  await run(async () => {
  status('Conectando ao editor…');
  const context = await adapter.context(); connected = true;
  $('store').textContent = context.storeName; $('connection-dot').classList.add('connected');
  $<HTMLInputElement>('confirm-store').placeholder = context.storeName;
  const previous = await get<Snapshot>(`baseline:${await contextKey(context)}`) || await get<Snapshot>('baseline');
  if (previous) try {assertContext(previous.context, context); setBaseline(previous);} catch { /* A backup from another shop is never selected implicitly. */ }
  history = await journalHistory(context); journal = history[0] || await get<Journal>('journal');
  if (journal) try {assertContext(journal.context, context);} catch {journal = undefined;}
  if (journal && !history.length) {await saveJournal(journal); const backup = await get('lastBackup'); if (backup) await put(`backup:${journal.id}`, backup);}
  await updateHistory(); journalInfo(); status('Editor conectado', 'A cópia aguarda sua confirmação. Confira a loja e clique em Confirmar e baixar ZIP para começar.');
  }, true, async () => {if (connection) {await connection.connect(); session = connection.token;}});
  if (!connected) $('store').textContent = 'Editor indisponível';
}
$('retry').addEventListener('click', () => void connect());
if (!isDemo && editorTab) chrome.runtime.onMessage.addListener(message => {
  if (message?.editorClicked === session && !working) {
    mode(false);
    if (!connected) void connect();
    else status('Aguardando sua confirmação', 'Clique em Confirmar e baixar ZIP para copiar os arquivos para o computador.');
  }
});
if (isDemo || editorTab) await connect();
else {status('Abra pelo ícone da extensão', 'No editor de código da Yampi, clique no ícone para conectar e baixar o tema.'); controls();}
