import type {Snapshot} from '../core/model';
export const demoImage = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0));
export const demoSnapshot: Snapshot = {
  context: {storeName: 'Loja de testes', previewOrigin: 'https://loja-exemplo.invalid', editorOrigin: 'http://127.0.0.1:5181'},
  capturedAt: '2026-10-07T00:00:00Z',
  assets: {'assets/images/example.png': demoImage},
  files: {
    'assets/images/readme.md': 'Exemplo fictício. Imagens do catálogo são dados separados.\n',
    'assets/styles/global/main.scss': '$brand: #20634f;\nbody { color: $brand; font-family: system-ui; max-width: 960px; margin: 40px auto; }\nbutton { padding: 12px 20px; cursor: pointer; }\n',
    'components/Example.vue': '<template><button @click="count++">{{ label }} · {{ count }}</button></template>\n<script>export default { name: "Example", props: ["label"], data() { return { count: 0 } } }</script>\n<style scoped>button { border: 2px solid #20634f; }</style>\n',
    'elements/head.twig': '<meta name="description" content="Exemplo fictício">\n',
    'elements/header/head.twig': '<header>Outro arquivo com o mesmo nome</header>\n',
    'sections/home/main_banner.twig': '<section><h1>{{ section.params.title }}</h1><p>{{ merchantData.manifest.name }}</p></section>\n',
    'templates/home.twig': '<main>{% include "sections/home/main_banner.twig" %}<example label="Clique para testar"></example><img src="{{ "images/example.png" | assets_url }}" alt="Imagem fictícia"></main>\n',
    'templates/long.twig': Array.from({length: 2000}, (_, i) => `<p>Linha ${i + 1} · conteúdo de teste 🎮</p>`).join('\n') + '\n'
  }
};
