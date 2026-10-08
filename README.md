# Yampi Theme Sync

Extensão de navegador para exportar os arquivos do tema Yampi como um projeto executável no computador e salvar de volta as alterações escolhidas. Projeto independente, sem vínculo com a Yampi. Código público; arquivos e dados das lojas permanecem locais.

## Estado da versão 0.2.4

Implementados: exportação dos textos e imagens dos assets com caminhos completos e SHA-256, projeto portátil com ferramentas Twig/Sass/Vue 2, prévia com dados fictícios, importação da pasta inteira ou ZIP de retorno, comparação entre original/local/loja, envio de textos existentes, backup antes do envio, conferência após reload, histórico por loja e restauração protegida contra alterações posteriores. Exportações antigas no formato versão 1 continuam aceitas.

O ícone abre um painel lateral nativo na mesma aba e conecta ao editor. Nenhum arquivo é aberto ou copiado até clicar em **Confirmar e baixar ZIP**. A cópia não exige importar um arquivo nem digitar o nome da loja. **Baixar arquivos** copia da Yampi para o computador; **Enviar alterações** recebe o projeto editado e inicia a comparação. A confirmação do nome da loja aparece após a comparação, antes da gravação. Erros de conexão mantêm o motivo original e oferecem nova tentativa, que recria a conexão quando necessário. O painel envia uma mensagem periódica ao worker enquanto está aberto; fechar o painel encerra esse mecanismo. Uma gravação interrompida nunca é retomada automaticamente.

A identificação combina a URL permitida, um único componente `yampi-code-editor`, sua árvore de arquivos, cabeçalho, nome da loja e origem da prévia. A leitura dos controles fica dentro do Shadow DOM aberto desse componente; elementos do aplicativo ao redor são ignorados. Não depende do texto “Editor de código”, do texto “Ver prévia” nem dos atributos gerados `data-v-*`. O CodeMirror é reconhecido ao abrir cada arquivo de texto, permitindo começar com nenhum arquivo selecionado. A versão 0.2.3 usa a API da instância do CodeMirror da própria página e aceita suas associações DOM antigas e atuais. Confere comprimento, linhas, leitura integral e estabilidade do documento; não copia apenas o trecho visível. Identidade ambígua, estrutura desconhecida, rascunhos pendentes e substituição do componente durante uma operação interrompem o acesso.

Na cópia, a extensão abre os arquivos para leitura, sem editar, salvar, excluir ou publicar. O fluxo de captura recebe apenas operações de leitura. O worker bloqueia comandos de gravação durante a exportação e a comparação, antes de injetá-los na página. A autorização de gravação é separada e encerrada ao terminar o envio escolhido pelo usuário. Uma leitura incompleta interrompe a exportação.

O fluxo é testado em um editor fictício com Shadow DOM aberto e versões reais antiga e atual do CodeMirror, testes unitários e teste de integração em Chromium com extensão Manifest V3, worker, downloads e IndexedDB. A exportação teve zero alterações de conteúdo, salvamentos ou acionamentos de controles de exclusão, criação, renomeação e publicação nesse teste. O teste intercepta toda requisição à origem Yampi e entrega apenas o editor fictício; usa permissão de host adicional somente na cópia temporária de teste. A estrutura do componente foi conferida no módulo JavaScript público da Yampi em 08/10/2026. Posteriormente, o proprietário relatou uma exportação textual real concluída na 0.2.3: o pacote recebido foi conferido fora deste repositório público, com tamanhos e hashes preservados e ZIP de retorno aceito pelo importador. Isso não substitui comparar cada arquivo independentemente com a loja, testar redes lentas ou validar imagens e gravações reais. Nenhuma gravação na loja de um cliente foi feita para testar esta versão.

Na 0.2.4 foram corrigidas as entradas Sass, a variável de assets fornecida pela plataforma, aliases `@/components` e bibliotecas `~/`, funções de seta no Twig, componentes Vue funcionais e helpers de execução. Fora deste repositório público, o projeto textual exportado foi compilado e suas cinco páginas foram abertas em Chromium, com componentes ativos, sem erros ou avisos Vue e sem requisições externas. Isso valida a prévia com dados fictícios usada nesse teste; não reproduz o backend ou as configurações reais da loja. Os arquivos e relatórios da loja permanecem no projeto privado.

O painel global fica desativado. Somente um clique no ícone habilita o painel na aba do editor; navegar para outra página o desativa. Chrome 142 ou posterior também desativa a associação quando o painel é fechado. Em versões anteriores, retornar a uma aba onde o painel continua aberto pode mostrá-lo novamente, conforme o comportamento do navegador.

Esta versão não cria, renomeia ou exclui arquivos e pastas, nem publica a loja. Arquivos novos e imagens alteradas aparecem bloqueados na comparação. A exportação de PNG/JPG/JPEG/WebP/SVG dos assets está implementada; o ciclo completo com PNG foi verificado no editor fictício. A leitura depende de uma única prévia da imagem no editor e de download sem credenciais permitido por CORS. Se uma imagem ou texto não puder ser lido integralmente, a exportação falha sem entregar um ZIP parcial como completo. Logs gerados pelo editor são excluídos do inventário do tema. Imagens de catálogo, produtos, preços, configurações visuais e dados de clientes não são exportados. Não há upload de imagens nesta versão.

## Preparar o projeto

Requisito: Node.js 24. Para desenvolver a extensão:

```powershell
npm ci
npm run check
npm run dev
```

Demonstração: http://127.0.0.1:5181/demo.html?demo=1. O servidor escuta somente no computador local. A demonstração usa dados fictícios e persiste seu estado localmente no navegador.

```powershell
npm run package
```

Produz `releases/yampi-theme-sync-0.2.4.zip` com os arquivos instaláveis e o SHA-256 ao lado. O pacote usa uma lista explícita de arquivos e não inclui a demonstração nem exportações de lojas. A pasta `dist` também permite carregar a extensão sem compactar. O painel lateral requer Chrome/Edge compatível com a API `sidePanel` (Chrome 120 ou posterior); outros navegadores não foram validados.

Para executar o teste do navegador:

```powershell
npx playwright install chromium
npm run test:e2e
```

O teste instala as dependências de um projeto fictício exportado numa pasta temporária, verifica a prévia interativa e limpa essa pasta. Não usa sua sessão de navegador. O servidor de prévia do teste usa a porta 5182.

## Usar em uma loja

1. Carregue a extensão conforme [INSTALACAO.md](docs/INSTALACAO.md).
2. Abra o editor de código em `https://app.yampi.com.br/store/code-editor/` e clique no ícone da extensão.
3. Confira a loja no topo e clique em **Confirmar e baixar ZIP** para começar a cópia. Acompanhe o progresso; o ZIP é baixado ao terminar. Preserve o ZIP original e extraia o pacote em uma pasta fora deste repositório. Abra essa pasta no VS Code, execute `npm ci` e `npm run dev` com Node 24. Abra http://127.0.0.1:5182 e edite os arquivos de `tema/`.
4. Volte ao editor e escolha **Enviar alterações** no painel lateral. Selecione a pasta inteira do projeto, ou execute `npm run check` e `npm run pack` no computador e selecione `retorno-yampi.zip`. A pasta `tema` também é aceita quando a exportação original já está carregada. Dependências, ferramentas, dados fictícios e arquivos fora do tema não são enviados. ZIPs compactados com uma pasta externa única são aceitos. A importação local funciona mesmo com o editor indisponível; comparar/enviar exige conexão com a aba original.
5. A comparação começa automaticamente. Revise as versões e os arquivos selecionados. Arquivos que mudaram tanto localmente quanto na loja ficam bloqueados como conflitos. **Comparar novamente com a loja** atualiza a revisão.
6. Confirme o nome da loja e clique em **Enviar alterações para o editor**. Esse nome confirma o destino, não é um arquivo a importar. O backup precisa persistir no navegador e terminar de baixar antes da primeira gravação.
7. Confira **Ver prévia** na Yampi. Publique manualmente somente após validar as páginas e funções da loja.

O ZIP original contém `.yampi-sync/manifest.json` e `.yampi-sync/baseline/`. Não altere esses metadados nem a cópia original. A exportação manual anterior, sem esse formato, não é aceita automaticamente: faça a primeira exportação pela extensão antes de sincronizar, mantendo a loja na versão original. O SHA-256 verifica a integridade do pacote, não a legitimidade do remetente de um ZIP recebido de outra pessoa.

## Prévia no computador

Abra a pasta extraída no VS Code ou seu arquivo `.code-workspace`. O `README.md` explica os comandos; o código editável está em `tema/`. `.yampi-sync` é criada pela extensão e contém os originais, o manifesto com hashes e as ferramentas locais. Fica recolhida no explorador do VS Code; deve ser preservada. O pacote npm, README e workspace usam o nome lido do editor, com normalização apenas para nomes de arquivos e do pacote.

O projeto inclui versões fixas das dependências e lockfile. `local.config.json` define páginas, entradas Sass globais e por página, estilos móveis e aliases de seções; `local.data.json` fornece dados fictícios editáveis por página. A prévia renderiza Twig com includes, `filter`/`map` com funções de seta, compila Sass e registra componentes Vue 2, incluindo templates funcionais e estilos `scoped`. Resolve componentes exportados e um conjunto explícito de bibliotecas, mixins e leituras simuladas. Carrosséis usam Splide; zoom e o emissor do editor têm implementações locais reduzidas. Recursos desconhecidos geram erro, sem substituição automática por módulos vazios. Blocos Vue com `module`, `src` e pre-processadores de template/script não são suportados. `npm run check` também recusa bindings Vue inválidos no HTML renderizado.

É uma prévia parcial do layout, não uma cópia do backend Yampi. Ela não reproduz checkout, carrinho, catálogo ou configurações reais. O servidor escuta somente em `127.0.0.1`, recusa escrita e hosts externos, serve apenas as rotas locais previstas e bloqueia chamadas externas, formulários e recursos remotos por CSP. Twig e Sass não podem carregar arquivos fora do tema. `npm run pack` confere a origem e compacta somente `tema/` e os metadados necessários; não executa nem envia dados/ferramentas locais. Valide as páginas e funções na prévia da Yampi antes de publicar manualmente.

Vue 2.7.16 acompanha a versão documentada pela Yampi, mas está fora de manutenção. `npm audit` informa os avisos conhecidos em Vue 2 e `vue-template-compiler`. Essas bibliotecas pertencem ao simulador local e não executam no painel da extensão. Use somente projetos confiáveis; a prévia executa o código Vue editado no navegador. O simulador não deve ser exposto na rede ou usado como servidor de produção.

## Comparação e recuperação

| Resultado | Comportamento |
|---|---|
| Local mudou e loja continua igual ao original | Pode ser selecionado para envio |
| Local e loja têm o mesmo conteúdo | Não grava novamente |
| Mudou apenas na loja | Preserva a versão da loja |
| Local e loja mudaram de formas diferentes | Bloqueia como conflito |
| Ausente na pasta local | Preserva o arquivo da loja |
| Novo, removido na loja ou tipo sem suporte | Bloqueia; não cria duplicatas |

Antes de enviar, todos os caminhos selecionados são relidos após recarregar o editor. O editor também é recarregado antes de cada gravação para não usar uma cópia antiga de uma aba aberta. Cada arquivo é conferido novamente imediatamente antes de salvar. A operação para ao primeiro erro. O registro guarda o conteúdo anterior, o conteúdo proposto, os arquivos conferidos e o arquivo pendente. Não é uma transação atômica do servidor: uma falha pode deixar parte do lote salva no rascunho. Sem um mecanismo de comparação atômica fornecido pelo servidor, uma edição externa no intervalo entre ler e salvar ainda pode ocorrer; evite edição simultânea durante o envio.

Selecione um envio no **Histórico desta loja**, baixe seu backup ou registro e use **Comparar para restaurar** para preparar a volta ao estado anterior. O histórico preserva registros anteriores mesmo após novos envios. Um arquivo que recebeu outra alteração depois do envio fica bloqueado. Não há restauração automática que sobrescreva trabalho alheio. Depois de um envio parcial, recarregue o editor, trate qualquer rascunho não salvo e compare novamente. Arquivos já enviados e iguais ao local aparecem como já aplicados.

O adaptador identifica a loja pelo nome no cabeçalho, origem da prévia e origem do editor. Uma mudança nesses sinais interrompe o envio. Isso não equivale a um identificador oficial de loja/tema fornecido por API. Não troque a loja ou o tema durante uma sessão; uma mudança de tema dentro da mesma loja exige reexportar e abrir uma nova sessão.

## Privacidade

- O proprietário autorizou o repositório **público** em 07/10/2026. Ele contém somente a ferramenta e exemplos fictícios. Projetos, temas e dados de lojas não pertencem a este repositório.
- A ferramenta funciona na aba Yampi já autenticada. Não pede, exporta ou armazena senha, cookies ou token de API.
- Sem telemetria, serviços externos ou permissões de acesso global aos sites. `activeTab` e `scripting` permitem operar a aba escolhida ao clicar na extensão; o worker também restringe a URL ao editor Yampi.
- `storage` guarda sessões temporárias. Cópias originais e histórico ficam em IndexedDB local, separados por contexto da loja; cada envio mantém seu backup e registro. Não há criptografia adicional. ZIPs e registros baixados também são arquivos locais legíveis.
- **Apagar dados locais da extensão** remove os registros do navegador. Os ZIPs já baixados continuam no computador. A extensão não envia nenhum deles ao GitHub.
- Exportações não devem ser copiadas para este repositório. `.gitignore` bloqueia diretórios comuns de exportação/backup, mas não substitui revisar o que será commitado.

## Limites atuais

O adaptador depende da estrutura do componente do editor Yampi e das associações internas DOM do CodeMirror (`cmView/rootView` ou `cmTile/root`) para encontrar a instância da página. Confirma essa instância pela API `findFromDOM` da própria versão e lê seu modelo completo. Uma associação desconhecida é recusada, sem tentar editar o campo ou copiar apenas o texto visível. Mudanças de títulos são toleradas; alterações no componente, árvore, identificação da loja ou controles podem exigir manutenção. Não há garantia de compatibilidade com qualquer redesign futuro. Um Shadow DOM fechado é recusado quando sua estrutura interna não está acessível. A versão não valida toda a semântica de Twig, Vue ou as regras de negócio da loja; a comparação reduz sobrescritas acidentais, mas não garante que qualquer código local funcione. Limites: 2 MiB por arquivo, 32 MiB de conteúdo do tema, 3.000 arquivos, UTF-8 e caminhos compatíveis com Windows. Finais CRLF de arquivos locais são convertidos para LF, como no editor.

## Arquitetura e próximos passos

- `src/core`: formato de arquivo, geração do projeto portátil, comparação entre três versões e coordenação dos envios.
- `src/browser`: adaptador do editor e worker Manifest V3. Não usa endpoints privados adivinhados nem credenciais fora do navegador.
- `src/panel.ts`: painel lateral nativo associado à aba do editor, com confirmação antes da cópia, progresso e importação separada do retorno.
- `src/demo`: editor fictício para validar leitura completa, gravação e recarregamento sem uma loja real.
- `local-runtime`: ferramentas incluídas no projeto exportado para prévia, validação e ZIP de retorno.
- `tests` e `scripts/e2e.mjs`: comparação, ZIP, imagens, runtime portátil, conflitos, cancelamento, envio parcial, histórico e isolamento de sessões/lojas.
- [ROADMAP.md](docs/ROADMAP.md): validação real, criação de novos arquivos, imagens, configurações e catálogo.
- [VALIDACAO.md](docs/VALIDACAO.md): procedimentos reproduzíveis e alcance dos testes executados.
- [TERCEIROS.md](docs/TERCEIROS.md): avisos de licença dos componentes incluídos no pacote.
- `docs/ci-example.yml`: exemplo de verificação no GitHub Actions. Não está instalado como workflow; a credencial usada na criação do repositório não possui o escopo `workflow`. Os checks desta entrega foram executados localmente.

Referências: [Editor de código Yampi](https://docs.yampi.com.br/editor-codigo/intro), [regras de arquivos e publicação](https://help.yampi.com.br/pt-BR/articles/13978494-como-acessar-o-editor-de-codigo), [CodeMirror](https://codemirror.net/docs/ref/), [Manifest V3 e scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [painel lateral do Chrome](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
