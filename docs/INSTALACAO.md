# Instalação local

1. Extraia `yampi-theme-sync-0.2.4.zip` em uma pasta fixa. Não carregue o ZIP diretamente.
2. Abra a página de extensões do Chrome (`chrome://extensions`) ou Edge (`edge://extensions`). O painel lateral depende da API `sidePanel`, disponível no Chrome 120 ou posterior. Outros navegadores não foram validados.
3. Ative o modo de desenvolvedor e escolha **Carregar sem compactação** / **Load unpacked**.
4. Selecione a pasta que contém `manifest.json`, `background.js`, `bridge.js`, `panel.js`, `panel.html` e `panel.css`.
5. Fixe o ícone da extensão. Abra o editor de código da loja na Yampi e clique nesse ícone.

Para atualizar uma instalação anterior da versão 0.2, extraia o novo ZIP sobre os arquivos da mesma pasta que você carregou no Chrome. Abra `chrome://extensions` e clique em **Recarregar** no cartão Yampi Theme Sync. Feche o painel antigo da extensão, recarregue a aba do editor sem rascunhos pendentes e clique no ícone. Se usar uma pasta diferente, remova a instalação antiga e carregue a nova pasta; isso pode apagar os backups locais da extensão, então baixe antes os que precisar preservar.

Durante desenvolvimento, `npm run build` atualiza a pasta `dist`. Carregue essa pasta e clique em Recarregar na página de extensões após mudar o código. Em seguida, recarregue a aba Yampi, sem rascunhos pendentes, para substituir o adaptador anterior.

O pacote é uma versão local de desenvolvimento, sem instalação automática ou aprovação de uma loja oficial de extensões. A versão 0.2 deve ser validada primeiro em ambiente controlado. A gravação foi testada somente no editor fictício, inclusive em Chromium com extensão Manifest V3. O teste usa permissão adicional somente na cópia temporária; o proprietário concluiu uma exportação textual real na 0.2.3, mas a 0.2.4 ainda precisa de nova conferência no painel real. Qualquer teste real de gravação depende de instruções específicas sobre ambiente e arquivo.

Ao clicar no ícone dentro do editor, abre-se um painel lateral na mesma aba. Confira a loja no topo e clique em **Confirmar e baixar ZIP**. Nenhum arquivo é aberto ou copiado antes desse botão, e nenhum arquivo precisa ser importado para exportar. A extensão abre os arquivos para leitura, sem editar, salvar, excluir ou publicar conteúdo na Yampi. O worker bloqueia comandos de gravação durante a cópia. Acompanhe o progresso; o ZIP é baixado ao concluir. Um erro interrompe a cópia e mostra o motivo.

Extraia a exportação fora do repositório da extensão e abra essa pasta no VS Code. Execute `npm ci` e `npm run dev` com Node 24 e edite `tema/`. Para devolver, selecione **Enviar alterações**, escolha a pasta inteira do projeto ou execute `npm run pack` e selecione o ZIP indicado no terminal. A comparação com a loja começa automaticamente. Revise os arquivos, confirme o nome da loja de destino e clique em **Enviar alterações para o editor**. Digitar o nome confirma o destino da gravação; copiar para o computador exige apenas o botão de confirmação, sem digitar nada.

Mantenha a aba da Yampi aberta, sem edições manuais enquanto a extensão trabalha. Não troque a loja ou o tema na mesma sessão. Salve ou descarte rascunhos pendentes manualmente antes de iniciar. Imagens podem ser exportadas para a prévia local, mas seu upload continua bloqueado. A extensão nunca aciona **Publicar loja**.

Dados das lojas nunca devem ser copiados para o repositório da extensão. A cópia original e os backups são guardados localmente; a extensão não os envia ao GitHub.
