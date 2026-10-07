# Instruções do projeto

- O proprietário autorizou tornar público este repositório em 07/10/2026. Compartilhe somente o código da ferramenta e exemplos fictícios. Não publique pacotes em uma loja de extensões sem novo pedido do usuário.
- Não copie temas, catálogo, exportações, backups, cookies, credenciais ou dados de clientes para o repositório. Testes usam apenas exemplos fictícios. Revise o conteúdo completo do índice antes de cada push.
- O projeto da extensão é separado dos projetos de redesign das lojas. Não altere arquivos desses outros projetos.
- Testes automatizados de escrita usam o editor fictício. Não use uma loja real de cliente como ambiente de teste de gravação. Para um teste real, obtenha instruções específicas do usuário sobre o ambiente e o arquivo de teste.
- Nunca acione automaticamente Publicar loja, excluir, renomear ou criar pastas. A versão 0.2 envia apenas arquivos de texto existentes e dos tipos suportados; imagens são exportadas para uso local, sem upload automático.
- Mantenha comparação entre original/local/remoto, preflight, backup persistido antes da gravação, conferência após reload e proteção para alterações posteriores na restauração.
- Pare no primeiro erro e preserve o registro do envio parcial. Não force sobrescritas nem use comparação apenas por nome de arquivo.
- Use Node 24, `npm ci`, `npm run check` e `npm run package`. Amplie os testes quando a mudança afetar integridade, gravação ou isolamento de lojas.
- Limitações e estado de validação real devem continuar explícitos no README. Não anuncie suporte de exportação para produtos, configurações ou imagens antes de implementá-lo e verificá-lo.
