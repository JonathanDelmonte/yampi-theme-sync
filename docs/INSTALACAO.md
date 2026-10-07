# Instalação local

1. Extraia `yampi-theme-sync-0.1.0.zip` em uma pasta fixa. Não carregue o ZIP diretamente.
2. Abra a página de extensões do navegador: `chrome://extensions`, `edge://extensions` ou `opera://extensions`.
3. Ative o modo de desenvolvedor e escolha **Carregar sem compactação** / **Load unpacked**.
4. Selecione a pasta que contém `manifest.json`, `background.js`, `bridge.js`, `panel.js`, `panel.html` e `panel.css`.
5. Fixe o ícone da extensão. Abra o editor de código da loja na Yampi e clique nesse ícone.

Durante desenvolvimento, `npm run build` atualiza a pasta `dist`. Carregue essa pasta e clique em Recarregar na página de extensões após mudar o código. Em seguida, recarregue a aba Yampi, sem rascunhos pendentes, para substituir o adaptador anterior.

O pacote é uma versão local de desenvolvimento, sem instalação automática ou aprovação de uma loja oficial de extensões. A versão 0.1 deve ser validada primeiro em ambiente controlado. A gravação foi testada somente no editor fictício. Um teste de exportação no painel real deve acontecer antes de habilitar um teste de gravação no ambiente escolhido pelo usuário.

O painel tem três passos: exportar, comparar a pasta `tema` e salvar os arquivos selecionados. Mantenha a aba da Yampi aberta, sem edições manuais enquanto a extensão trabalha. Não troque a loja ou o tema na mesma sessão. Salve ou descarte rascunhos pendentes manualmente antes de iniciar.

Dados das lojas nunca devem ser copiados para o repositório da extensão. A cópia original e os backups são guardados localmente; a extensão não os envia ao GitHub.
