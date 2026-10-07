# Yampi Theme Sync

Extensão de navegador para exportar os arquivos do tema Yampi como um projeto executável no computador e salvar de volta as alterações escolhidas. Projeto independente, sem vínculo com a Yampi. Código público; arquivos e dados das lojas permanecem locais.

## Estado da versão 0.2

Implementados: exportação dos textos e imagens dos assets com caminhos completos e SHA-256, projeto portátil com ferramentas Twig/Sass/Vue 2, prévia com dados fictícios, importação da pasta inteira ou ZIP de retorno, comparação entre original/local/loja, envio de textos existentes, backup antes do envio, conferência após reload, histórico por loja e restauração protegida contra alterações posteriores. Exportações antigas no formato versão 1 continuam aceitas.

O fluxo é testado em um editor fictício com CodeMirror real, testes unitários e teste de integração em Chromium com extensão Manifest V3, worker, downloads e IndexedDB. O teste de integração intercepta toda requisição à origem Yampi e entrega apenas o editor fictício; usa permissão de host adicional somente na cópia temporária de teste. A permissão `activeTab` acionada pelo ícone, a estrutura real do editor e a leitura/gravação no painel Yampi real ainda precisam de validação controlada. Nenhuma gravação na loja de um cliente foi feita para testar esta versão. A plataforma estava indisponível para o proprietário durante este desenvolvimento.

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

Produz `releases/yampi-theme-sync-0.2.0.zip` com os arquivos instaláveis e o SHA-256 ao lado. O pacote usa uma lista explícita de arquivos e não inclui a demonstração nem exportações de lojas. A pasta `dist` também permite carregar a extensão sem compactar.

Para executar o teste do navegador:

```powershell
npx playwright install chromium
npm run test:e2e
```

O teste instala as dependências de um projeto fictício exportado numa pasta temporária, verifica a prévia interativa e limpa essa pasta. Não usa sua sessão de navegador. O servidor de prévia do teste usa a porta 5182.

## Usar em uma loja

1. Carregue a extensão conforme [INSTALACAO.md](docs/INSTALACAO.md).
2. Abra o editor de código em `https://app.yampi.com.br/store/code-editor/` e clique no ícone da extensão.
3. Clique em **Exportar projeto local**, preserve o ZIP original e extraia o pacote em uma pasta fora deste repositório. Execute `npm ci` e `npm run dev` nessa pasta. Abra http://127.0.0.1:5182 e edite os arquivos de `tema/`.
4. Execute `npm run check` para compilar com os dados fictícios e `npm run pack` para gerar `retorno-yampi.zip`. Importe esse ZIP na extensão, ou selecione a pasta inteira do projeto. A pasta `tema` também é aceita quando a exportação original já está carregada. Dependências, ferramentas, dados fictícios e arquivos fora do tema não são enviados. ZIPs compactados com uma pasta externa única são aceitos. A importação local funciona mesmo com o editor indisponível; comparar/enviar exige uma nova sessão conectada.
5. Clique em **Comparar com a loja**. Revise as versões e os arquivos selecionados. Arquivos que mudaram tanto localmente quanto na loja ficam bloqueados como conflitos.
6. Confirme o nome da loja e salve os arquivos escolhidos. O backup precisa persistir no navegador e terminar de baixar antes da primeira gravação.
7. Confira **Ver prévia** na Yampi. Publique manualmente somente após validar as páginas e funções da loja.

O ZIP original contém `.yampi-sync/manifest.json` e `.yampi-sync/baseline/`. Não altere esses metadados nem a cópia original. A exportação manual anterior, sem esse formato, não é aceita automaticamente: faça a primeira exportação pela extensão antes de sincronizar, mantendo a loja na versão original. O SHA-256 verifica a integridade do pacote, não a legitimidade do remetente de um ZIP recebido de outra pessoa.

## Prévia no computador

O projeto exportado inclui versões fixas das dependências e lockfile. `local.config.json` define páginas, entradas Sass e aliases de seções; `local.data.json` fornece dados fictícios editáveis. A prévia renderiza Twig com includes, compila Sass e registra componentes Vue 2 pelo campo `name`, incluindo estilos `scoped`. Arquivos editados são relidos ao recarregar a página. Recursos incompatíveis geram erro visível em vez de uma validação falsa. Blocos Vue com `module`, `src`, pre-processadores de template/script e plugins/mixins próprios da Yampi ainda não são simulados.

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

O adaptador depende da estrutura visível do editor Yampi e da API pública do CodeMirror para ler o documento completo. Uma mudança de interface pode exigir manutenção. A versão não valida toda a semântica de Twig, Vue ou as regras de negócio da loja; a comparação reduz sobrescritas acidentais, mas não garante que qualquer código local funcione. Limites: 2 MiB por arquivo, 32 MiB de conteúdo do tema, 3.000 arquivos, UTF-8 e caminhos compatíveis com Windows. Finais CRLF de arquivos locais são convertidos para LF, como no editor.

## Arquitetura e próximos passos

- `src/core`: formato de arquivo, geração do projeto portátil, comparação entre três versões e coordenação dos envios.
- `src/browser`: adaptador do editor e worker Manifest V3. Não usa endpoints privados adivinhados nem credenciais fora do navegador.
- `src/panel.ts`: painel persistente em uma aba para que exportar não dependa de manter um popup aberto.
- `src/demo`: editor fictício para validar leitura completa, gravação e recarregamento sem uma loja real.
- `local-runtime`: ferramentas incluídas no projeto exportado para prévia, validação e ZIP de retorno.
- `tests` e `scripts/e2e.mjs`: comparação, ZIP, imagens, runtime portátil, conflitos, cancelamento, envio parcial, histórico e isolamento de sessões/lojas.
- [ROADMAP.md](docs/ROADMAP.md): validação real, criação de novos arquivos, imagens, configurações e catálogo.
- [VALIDACAO.md](docs/VALIDACAO.md): procedimentos reproduzíveis e alcance dos testes executados.
- [TERCEIROS.md](docs/TERCEIROS.md): avisos de licença dos componentes incluídos no pacote.
- `docs/ci-example.yml`: exemplo de verificação no GitHub Actions. Não está instalado como workflow; a credencial usada na criação do repositório não possui o escopo `workflow`. Os checks desta entrega foram executados localmente.

Referências: [Editor de código Yampi](https://docs.yampi.com.br/editor-codigo/intro), [regras de arquivos e publicação](https://help.yampi.com.br/pt-BR/articles/13978494-como-acessar-o-editor-de-codigo), [CodeMirror](https://codemirror.net/docs/ref/), [Manifest V3 e scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
