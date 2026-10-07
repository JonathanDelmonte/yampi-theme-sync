import engine from '../../local-runtime/engine.mjs?raw';
import dev from '../../local-runtime/dev.mjs?raw';
import pack from '../../local-runtime/pack.mjs?raw';
import pkg from '../../local-runtime/package.json?raw';
import lock from '../../local-runtime/package-lock.json?raw';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export function localKit(paths: string[]): Record<string, string> {
  const templates = paths.filter(p => p.startsWith('templates/') && p.endsWith('.twig'));
  const sectionFiles = paths.filter(p => p.startsWith('sections/') && p.endsWith('.twig'));
  const sections = Object.fromEntries(sectionFiles.map(p => [p.slice(9, -5), p]));
  for (const p of sectionFiles) {
    const alias = p.split('/').at(-1)!.slice(0, -5);
    if (sectionFiles.filter(f => f.split('/').at(-1) === p.split('/').at(-1)).length === 1) sections[alias] = p;
  }
  return {
    'package.json': pkg, 'package-lock.json': lock,
    '.yampi-sync/tools/engine.mjs': engine, '.yampi-sync/tools/dev.mjs': dev, '.yampi-sync/tools/pack.mjs': pack,
    'local.config.json': json({port: 5182, pages: Object.fromEntries(templates.map(p => [p.slice(10, -5), p])), styles: paths.filter(p => /^assets\/styles\/global\/[^/]+\.(s?css)$/.test(p) && !p.split('/').at(-1)!.startsWith('_')), sections}),
    'local.data.json': json({merchantData: {manifest: {name: 'Loja local fictícia'}, domain: 'http://127.0.0.1:5182', checkout: {}, meta: {}, company: {}}, pageConfig: {page: 'home', theme: {alias: 'local', params: {}}, sections: []}, sections: [], section: {params: {title: 'Prévia local fictícia'}}, categories: [], sorted_categories: [], featured_categories: [], products: [], product: {id: 1, name: 'Produto fictício', prices: {price: 100, price_formated: 'R$ 100,00', has_promotion: false}, texts: {description: 'Dados fictícios para desenvolvimento'}}, content: {data: [], meta: {}, limit: 12}}),
    '.gitignore': 'node_modules/\n.cache/\n*.zip\n*.env\n.env*\ntema/\n.yampi-sync/baseline/\n.yampi-sync/manifest.json\nlocal.data.json\n',
    'LEIA-ME-LOCAL.md': '# Trabalhar no computador\n\nRequisito: Node.js 24. Nesta pasta execute `npm ci` e `npm run dev`. Abra http://127.0.0.1:5182. Edite os arquivos em `tema/`; recarregue a prévia para ver as mudanças. `npm run check` confere o original e compila os templates, Vue e Sass. `npm run pack` cria `retorno-yampi.zip` com o tema editado e a origem intacta. Na extensão, importe esse ZIP ou selecione esta pasta inteira.\n\n`local.config.json` escolhe páginas, entradas Sass e o mapa de aliases de seções. `local.data.json` contém apenas dados fictícios editáveis. A prévia é um simulador: não inclui o backend, catálogo, configurações reais, carrinho, checkout, mixins/plugins proprietários nem todos os recursos Twig da Yampi. Chamadas externas, formulários e publicação são bloqueados. Dependências Vue 2 são mantidas para compatibilidade com a Yampi e estão fora de manutenção. Erros de compatibilidade aparecem na prévia; nunca valide uma publicação apenas aqui.\n\nImagens do tema exportadas ficam em `tema/assets/`. Imagens alteradas ou novas não são enviadas de volta nesta versão; aparecerão bloqueadas na comparação. Não altere `.yampi-sync/manifest.json` nem `.yampi-sync/baseline/`. Arquivos de ferramentas, dependências e dados locais não são enviados para a loja. Arquivos novos exigem criação manual no editor e uma nova exportação.\n\nGuarde este projeto fora do repositório da extensão. Ele pode conter conteúdo privado da loja. O ZIP de retorno não inclui ferramentas nem dados locais.\n'
  };
}
