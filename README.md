# Yampi Theme Sync

Extensão privada para levar os arquivos do editor de código da Yampi ao computador e salvar de volta as alterações escolhidas. Projeto independente, sem vínculo com a Yampi.

## Estado da versão 0.1

Implementados: exportação dos arquivos de texto com caminhos completos, ZIP com SHA-256, leitura da pasta local, comparação entre original/local/loja, envio para arquivos existentes, backup antes do envio, conferência após recarregar o editor e preparação de restauração com proteção para alterações posteriores.

O fluxo foi testado em um editor fictício com CodeMirror real, além dos testes automatizados. A instalação como extensão e o comportamento de gravação no painel Yampi real ainda precisam de validação controlada. Nenhuma gravação na loja de um cliente foi feita para testar esta versão.

Esta versão não cria, renomeia ou exclui arquivos e pastas. Ela não publica a loja. Arquivos novos aparecem na comparação como bloqueados. Tipos binários, imagens de catálogo, produtos, preços, configurações do tema e dados de clientes ainda não são exportados. Se um arquivo da árvore não puder ser lido integralmente, a exportação falha; um ZIP parcial não é apresentado como completo.

## Preparar o projeto

Requisito: Node.js 24 ou superior. As dependências já estão instaladas na máquina onde o projeto foi criado. Em outro computador:

```powershell
npm ci
npm run check
npm run dev
```

Demonstração: http://127.0.0.1:5181/demo.html?demo=1. O servidor escuta somente no computador local. A demonstração usa dados fictícios e persiste seu estado localmente no navegador.

```powershell
npm run package
```

Produz `releases/yampi-theme-sync-0.1.0.zip` com os arquivos instaláveis e o SHA-256 ao lado. O pacote usa uma lista explícita de arquivos e não inclui a demonstração nem exportações de lojas. A pasta `dist` também permite carregar a extensão sem compactar.

## Usar em uma loja

1. Carregue a extensão conforme [INSTALACAO.md](docs/INSTALACAO.md).
2. Abra o editor de código em `https://app.yampi.com.br/store/code-editor/` e clique no ícone da extensão.
3. Exporte o tema. Preserve o ZIP original. Extraia o pacote e edite os arquivos da pasta `tema` localmente.
4. Na extensão, carregue o ZIP original, se necessário, e escolha a pasta `tema` editada. Pode selecionar a pasta `tema` de um projeto local: não selecione a raiz inteira que contém dependências e ferramentas.
5. Clique em **Comparar com a loja**. Revise as versões e os arquivos selecionados. Arquivos que mudaram tanto localmente quanto na loja ficam bloqueados como conflitos.
6. Confirme o nome da loja e salve os arquivos escolhidos. O backup precisa persistir no navegador e terminar de baixar antes da primeira gravação.
7. Confira **Ver prévia** na Yampi. Publique manualmente somente após validar as páginas e funções da loja.

O ZIP original contém `.yampi-sync/manifest.json` e `.yampi-sync/baseline/`. Não altere esses metadados nem a cópia original. A exportação manual anterior, sem esse formato, não é aceita automaticamente: faça a primeira exportação pela extensão antes de sincronizar, mantendo a loja na versão original. O SHA-256 verifica a integridade do pacote, não a legitimidade do remetente de um ZIP recebido de outra pessoa.

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

Use **Comparar para restaurar** para preparar a volta ao estado anterior. Um arquivo que recebeu outra alteração depois do envio fica bloqueado. Não há restauração automática que sobrescreva trabalho alheio. Depois de um envio parcial, recarregue o editor, trate qualquer rascunho não salvo e compare novamente. Arquivos já enviados e iguais ao local aparecem como já aplicados.

O adaptador identifica a loja pelo nome no cabeçalho, origem da prévia e origem do editor. Uma mudança nesses sinais interrompe o envio. Isso não equivale a um identificador oficial de loja/tema fornecido por API. Não troque a loja ou o tema durante uma sessão; uma mudança de tema dentro da mesma loja exige reexportar e abrir uma nova sessão.

## Privacidade

- O repositório deve permanecer **privado**. Não contém arquivos ou dados de nenhuma loja real.
- A ferramenta funciona na aba Yampi já autenticada. Não pede, exporta ou armazena senha, cookies ou token de API.
- Sem telemetria, serviços externos ou permissões de acesso global aos sites. `activeTab` e `scripting` permitem operar a aba escolhida ao clicar na extensão; o worker também restringe a URL ao editor Yampi.
- `storage` guarda sessões temporárias. Cópias originais, backup e registro de envio ficam em IndexedDB local, sem criptografia adicional. Os ZIPs baixados também são arquivos locais em texto legível.
- **Apagar dados locais da extensão** remove os registros do navegador. Os ZIPs já baixados continuam no computador. A extensão não envia nenhum deles ao GitHub.
- Exportações não devem ser copiadas para este repositório. `.gitignore` bloqueia diretórios comuns de exportação/backup, mas não substitui revisar o que será commitado.

## Limites atuais

O adaptador depende da estrutura visível do editor Yampi e da API pública do CodeMirror para ler o documento completo. Uma mudança de interface pode exigir manutenção. A versão não valida toda a semântica de Twig, Vue ou as regras de negócio da loja; a comparação reduz sobrescritas acidentais, mas não garante que qualquer código local funcione. Limites: 2 MiB por arquivo, 32 MiB de conteúdo do tema, 3.000 arquivos, UTF-8 e caminhos compatíveis com Windows. Finais CRLF de arquivos locais são convertidos para LF, como no editor.

## Arquitetura e próximos passos

- `src/core`: formato de arquivo, comparação entre três versões e coordenação dos envios.
- `src/browser`: adaptador do editor e worker Manifest V3. Não usa endpoints privados adivinhados nem credenciais fora do navegador.
- `src/panel.ts`: painel persistente em uma aba para que exportar não dependa de manter um popup aberto.
- `src/demo`: editor fictício para validar leitura completa, gravação e recarregamento sem uma loja real.
- `tests`: comparação, ZIP, conflitos, cancelamento, envio parcial e isolamento de sessões.
- [ROADMAP.md](docs/ROADMAP.md): validação real, criação de novos arquivos, imagens, configurações e catálogo.
- [TERCEIROS.md](docs/TERCEIROS.md): avisos de licença dos componentes incluídos no pacote.
- `docs/ci-example.yml`: exemplo de verificação no GitHub Actions. Não está instalado como workflow; a credencial usada na criação do repositório não possui o escopo `workflow`. Os checks desta entrega foram executados localmente.

Referências: [Editor de código Yampi](https://docs.yampi.com.br/editor-codigo/intro), [regras de arquivos e publicação](https://help.yampi.com.br/pt-BR/articles/13978494-como-acessar-o-editor-de-codigo), [CodeMirror](https://codemirror.net/docs/ref/), [Manifest V3 e scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
