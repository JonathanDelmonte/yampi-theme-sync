# Validação da versão 0.2.3

Execução local em 08/10/2026, Node.js 24.15.0, Windows. Os testes usam somente dados fictícios.

## Verificações reproduzíveis

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run package
```

Os 111 testes de unidade cobrem comparação entre original/local/remoto, hashes, limites de extração, caminhos Windows, imagens, exportação antiga, importação da pasta inteira, ZIP com pasta externa, integridade da origem, preflight, backup, cancelamento, envio parcial, isolamento de sessões e histórico por loja. Incluem reconhecimento das duas associações DOM do CodeMirror pela API da instância, documento vazio, BOM, acentos, linhas finais, documento longo, leitura inconsistente e documento alterado durante a cópia. A captura não acessa operações de gravação; falha e cancelamento não produzem uma exportação parcial como completa. Locks de leitura recusam gravações antes da injeção, e a autorização de envio expira ao terminar. A conexão inclui heartbeat autenticado, parada ao fechar, erro sem repetição de escrita, recriação do port após desconexão e proteção do lock quando um port antigo encerra. O runtime local também é verificado contra leitura de arquivos fora do tema, links, escrita HTTP e hosts externos.

O teste de navegador instala uma cópia temporária da extensão Manifest V3 em um perfil Chromium próprio. Toda requisição à origem do painel Yampi é interceptada e substituída pelo editor fictício; requisições externas não previstas são abortadas. A cópia temporária recebe uma permissão de host exclusiva do teste. A extensão distribuída continua usando `activeTab`, sem essa permissão adicional.

O fluxo verificado inclui documento com 2.000 linhas, nomes iguais em diretórios diferentes, PNG, projeto exportado instalado com `npm ci`, compilação Twig/Sass/Vue 2 e CSS scoped, interação Vue no navegador, imagem servida localmente, seleção real da pasta com dependências ignoradas, ZIP de retorno, arquivo novo bloqueado, backup persistido/baixado, gravação e conferência após reload, histórico após reabrir o painel, proteção de uma alteração posterior durante restauração, rejeição de origem adulterada e zero acionamentos de publicação.

O teste usa o painel lateral nativo (`SIDE_PANEL` real), acionado pelo mesmo handler de produção a partir de um clique em uma página auxiliar exclusiva da cópia temporária. Abrir e reabrir pelo ícone deixa zero arquivos abertos e zero downloads até clicar em **Confirmar e baixar ZIP**. A exportação usa somente comandos de contexto, inventário e leitura, sob lock de leitura. Contadores e a comparação do conteúdo persistido confirmam zero edições, salvamentos e acionamentos de exclusão, renomeação, criação e publicação durante a cópia. A leitura integral passa com CodeMirror 6.36.2 (`cmView/rootView`) e com a versão atual fixada no lockfile (`cmTile/root`). Essas bibliotecas executam somente no editor fictício; não são incluídas no pacote da extensão.

Também verifica comparação automática ao importar, confirmação do destino após revisão, persistência através do reload e ausência de nova exportação ao recarregar o painel. O editor fictício fica em um Shadow DOM aberto. Títulos diferentes e controles semelhantes fora do componente não interferem na exportação. Múltiplos componentes, Shadow DOM fechado, rascunho em aba inativa, troca de loja e substituição do componente durante a leitura são recusados. Identidade ambígua mantém o erro original visível mesmo após desconexão forçada; retry recria o port e reconecta. Uma mensagem periódica real alcança o worker durante o teste. A página auxiliar, sua permissão, controles de desconexão e o driver CDP não fazem parte do pacote distribuído.

## Estado do painel real

A análise do [módulo público do editor Yampi](https://lisa.yampi.com.br/web-component-550f3324.mjs), em 08/10/2026, confirmou o componente `yampi-code-editor`, Shadow DOM aberto, cabeçalho, árvore, CodeMirror e indicadores de carregamento/rascunho. Confirmou também a associação `cmView/rootView`, incompatível com a descoberta de instância da biblioteca mais recente antes usada pela extensão. A versão 0.2.3 encontra a instância pela associação correspondente e valida com `findFromDOM` da própria página. Somente os seletores e o comportamento observado orientaram o adaptador; o módulo da Yampi e o HTML de uma sessão real não integram o repositório nem o pacote.

O proprietário relatou que a versão 0.2.2 reconheceu o editor e abriu arquivos, mas falhou na leitura completa do CodeMirror. Em 08/10/2026, relatou a conclusão de uma exportação textual real com a versão 0.2.3 e forneceu seu ZIP. Fora deste repositório público, a análise do pacote confirmou os tamanhos e hashes entre manifesto, original e tema local. O ZIP de retorno foi aceito pelo importador da extensão com conteúdo e origem preservados. O tema e os relatórios dessa loja permanecem no projeto privado expressamente solicitado pelo proprietário.

Essa conferência não compara independentemente cada arquivo com o editor remoto nem certifica que todo inventário dinâmico foi capturado em qualquer condição de rede. O pacote recebido não permitiu validar imagens reais. Gravações, reload e restauração reais continuam sem teste; os testes de escrita acima são fictícios. A análise de JavaScript público não substitui esses testes.

O teste de compilação da prévia com o projeto real falhou. A análise separada identificou dependências Sass injetadas pela plataforma, imports de módulos internos e sintaxe Twig que o simulador ainda não cobre. Integridade da exportação e geração do ZIP de retorno não equivalem à aprovação de uma loja funcional no computador. A compatibilidade deve ser ampliada com testes fictícios, sem incorporar o tema real neste repositório.

Uma próxima validação real deve começar pela exportação e conferência do inventário. Qualquer teste real de gravação depende de instruções específicas do proprietário sobre a loja de teste e o arquivo escolhido. Nunca publique automaticamente. A prévia local é parcial e utiliza dados fictícios; não substitui a prévia final da Yampi.
