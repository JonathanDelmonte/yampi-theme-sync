# Validação da versão 0.2.2

Execução local em 08/10/2026, Node.js 24.15.0, Windows. Os testes usam somente dados fictícios.

## Verificações reproduzíveis

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run package
```

Os 94 testes de unidade cobrem comparação entre original/local/remoto, hashes, limites de extração, caminhos Windows, imagens, exportação antiga, importação da pasta inteira, ZIP com pasta externa, integridade da origem, preflight, backup, cancelamento, envio parcial, isolamento de sessões e histórico por loja. A conexão inclui heartbeat autenticado, parada ao fechar, erro sem repetição de escrita, recriação do port após desconexão e proteção do lock quando um port antigo encerra. O runtime local também é verificado contra leitura de arquivos fora do tema, links, escrita HTTP e hosts externos.

O teste de navegador instala uma cópia temporária da extensão Manifest V3 em um perfil Chromium próprio. Toda requisição à origem do painel Yampi é interceptada e substituída pelo editor fictício; requisições externas não previstas são abortadas. A cópia temporária recebe uma permissão de host exclusiva do teste. A extensão distribuída continua usando `activeTab`, sem essa permissão adicional.

O fluxo verificado inclui documento com 2.000 linhas, nomes iguais em diretórios diferentes, PNG, projeto exportado instalado com `npm ci`, compilação Twig/Sass/Vue 2 e CSS scoped, interação Vue no navegador, imagem servida localmente, seleção real da pasta com dependências ignoradas, ZIP de retorno, arquivo novo bloqueado, backup persistido/baixado, gravação e conferência após reload, histórico após reabrir o painel, proteção de uma alteração posterior durante restauração, rejeição de origem adulterada e zero acionamentos de publicação.

O teste usa o painel lateral nativo (`SIDE_PANEL` real), acionado pelo mesmo handler de produção a partir de um clique em uma página auxiliar exclusiva da cópia temporária. Verifica exportação automática sem importação prévia e sem abrir outra aba, comparação automática ao importar, confirmação só após revisão, persistência através do reload e ausência de nova exportação ao recarregar o painel. O editor fictício fica em um Shadow DOM aberto. Títulos diferentes e controles semelhantes fora do componente não interferem na exportação. Múltiplos componentes, Shadow DOM fechado, rascunho em aba inativa, troca de loja e substituição do componente durante a leitura são recusados. Identidade ambígua mantém o erro original visível mesmo após desconexão forçada; retry recria o port e reconecta. Uma mensagem periódica real alcança o worker durante o teste. A página auxiliar, sua permissão, controles de desconexão e o driver CDP não fazem parte do pacote distribuído.

## Estado do painel real

A análise do [módulo público do editor Yampi](https://lisa.yampi.com.br/web-component-550f3324.mjs), em 08/10/2026, confirmou o componente `yampi-code-editor`, Shadow DOM aberto, cabeçalho, árvore, CodeMirror e indicadores de carregamento/rascunho. Somente os seletores e o comportamento observado orientaram o adaptador; o módulo da Yampi e o HTML de uma sessão real não integram o repositório nem o pacote.

A exportação e a gravação em uma sessão real da Yampi ainda não foram validadas nesta versão. Os testes acima não certificam o clique no ícone com `activeTab`, a estabilidade dos seletores reais, o carregamento completo de árvores dinâmicas nem a equivalência entre preview e bytes das imagens na plataforma. A análise de JavaScript público não substitui esses testes.

Uma próxima validação real deve começar pela exportação e conferência do inventário. Qualquer teste real de gravação depende de instruções específicas do proprietário sobre a loja de teste e o arquivo escolhido. Nunca publique automaticamente. A prévia local é parcial e utiliza dados fictícios; não substitui a prévia final da Yampi.
