import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import type {Files} from '../core/model';
const initial: Files = {
  'assets/images/readme.md': 'Imagens de catálogo não fazem parte do tema.\n',
  'assets/styles/global/main.scss': '$brand: #20634f;\nbody { color: $brand; }\n',
  'components/Example.vue': '<template><button>{{ label }}</button></template>\n<script>export default { props: ["label"] }</script>\n',
  'elements/head.twig': '<meta name="description" content="Exemplo fictício">\n',
  'elements/header/head.twig': '<header>Outro arquivo com o mesmo nome</header>\n',
  'sections/home/main_banner.twig': '<section>{{ section.params.title }}</section>\n',
  'templates/home.twig': '<main>{% include "sections/home/main_banner.twig" %}</main>\n',
  'templates/long.twig': Array.from({length: 2000}, (_, i) => `<p>Linha ${i + 1} · conteúdo de teste 🎮</p>`).join('\n') + '\n'
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let files: Files = JSON.parse(sessionStorage.getItem('fixture-files') || JSON.stringify(initial));
let current: string | undefined, editor: EditorView | undefined, generation = 0, publications = Number(sessionStorage.getItem('fixture-publications') || 0);
$('test-info').textContent = `Publicações: ${publications}`;
function store() {sessionStorage.setItem('fixture-files', JSON.stringify(files));}
const save = $<HTMLButtonElement>('save');
save.addEventListener('click', () => {
  if (!current || !editor || save.disabled) return;
  const path = current, value = editor.state.doc.toString();
  // Keep enabled until the fake server has persisted, just as a save acknowledgment should.
  setTimeout(() => {
    files[path] = value; store(); save.disabled = true; $('tab').querySelector('.holder-icon')!.replaceChildren();
    $('version').textContent = 'Versão salva · ' + Date.now();
  }, 150);
});
function open(path: string, li: HTMLElement) {
  generation++; const id = generation;
  current = path;
  document.querySelectorAll('li.selected').forEach(e => e.classList.remove('selected')); li.classList.add('selected');
  $('tab').querySelector('p')!.textContent = path.split('/').pop()!;
  editor?.destroy(); editor = undefined; $('editor').innerHTML = '<div class="loading" aria-busy="true">Carregando arquivo…</div>';
  save.disabled = true;
  setTimeout(() => {
    if (generation !== id) return;
    $('editor').replaceChildren();
    editor = new EditorView({parent: $('editor'), state: EditorState.create({doc: files[path], extensions: [EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      save.disabled = update.state.doc.toString() === files[path];
      $('tab').querySelector('.holder-icon')!.innerHTML = save.disabled ? '' : '<svg width="8" height="8"><circle r="3" cx="4" cy="4"></circle></svg>';
    })]})});
  }, 450);
}
function folder(parent: HTMLElement, name: string): HTMLElement {
  const holder = document.createElement('div'); holder.className = 'collapse-list';
  const title = document.createElement('div'); title.className = 'folder-title';
  const span = document.createElement('span'); span.textContent = name; title.append(span);
  const list = document.createElement('ul'); list.className = 'all-files'; holder.append(title, list); parent.append(holder);
  title.addEventListener('click', () => holder.classList.toggle('active'));
  return list;
}
const folders = new Map<string, HTMLElement>();
for (const path of Object.keys(files).sort()) {
  const parts = path.split('/'); let parent = $('tree'), key = '';
  for (const name of parts.slice(0, -1)) {
    key += (key ? '/' : '') + name;
    if (!folders.has(key)) folders.set(key, folder(parent, name));
    parent = folders.get(key)!;
  }
  const li = document.createElement('li'); li.className = 'collapse-item';
  const name = document.createElement('span'); name.className = 'file-name'; name.textContent = parts.at(-1)!; li.append(name); parent.append(li);
  li.addEventListener('click', () => open(path, li));
  const option = document.createElement('option'); option.value = path; option.textContent = path; $('remote-file').append(option);
}
$('external-change').addEventListener('click', () => {
  const path = $<HTMLSelectElement>('remote-file').value; files[path] += '\n<!-- Alteração feita na loja depois da exportação -->\n'; store();
  if (current === path) open(path, document.querySelector('li.selected')!);
});
$('switch-shop').addEventListener('click', () => {$('shop-name').textContent = 'Outra loja de testes';});
$('reset').addEventListener('click', () => {sessionStorage.removeItem('fixture-files'); location.reload();});
$('publish').addEventListener('click', () => {sessionStorage.setItem('fixture-publications', String(++publications)); $('test-info').textContent = `Publicações: ${publications}`;});
