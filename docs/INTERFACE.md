# Interface e identidade

## Nomes aprovados

Repositório, pacote npm e pasta de desenvolvimento: **yampi-virtual-store-code-extractor-synchronizer**.

Nome de exibição no Chrome e no painel: **Yampi Code Sync**. Autoria: **Zirtuno**.

Virtual store identifica a loja virtual; code identifica os arquivos do editor; extractor e synchronizer descrevem a cópia para o computador e o retorno. O nome curto evita ocupar o cabeçalho inteiro da extensão. Os identificadores internos de arquivos e histórico são preservados para aceitar exportações anteriores.

A versão 0.3.3 usa a logo Y/código fornecida pelo proprietário, redimensionada com proporções e transparência preservadas. A pequena assinatura Zirtuno continua no cabeçalho. O Chrome controla a composição e o espaço entre descrição e ID na sua página de extensões; a descrição foi reduzida para uma frase curta, sem HTML ou artifícios de quebra de linha.

## Direção aplicada na 0.3.2

Uma ferramenta de trabalho compacta, com fundo quase branco, texto escuro e azul petróleo nas ações. A paleta deriva do ciano da Zirtuno, com saturação reduzida para leitura confortável. A logo original autorizada aparece em 18 px, na mesma linha de **Desenvolvido por Zirtuno**; o conjunto abre `https://www.instagram.com/zirtuno/` por clique. Não carrega fontes ou imagens remotas. A loja permanece no cabeçalho durante toda a operação.

| Antes | Depois | Motivo |
| --- | --- | --- |
| Botões e campos rígidos | Bordas de 8–12 px, hover suave e pressão curta | Tornar os controles mais convidativos |
| Ações somente em grafite | Azul petróleo e fundos suaves de ciano/ardósia | Dar destaque à ação sem cores intensas |
| Identidade apenas em texto | Ícone de código e pequena assinatura Zirtuno | Identificar a ferramenta e sua autoria |
| Ícone genérico com aviso abreviado | Símbolo de código e tooltip com o nome do editor | Explicar onde usar a extensão |
| Clique fora do editor sem orientação | Painel com botão para abrir o editor na mesma aba | Mostrar o próximo passo explicitamente |
| Cartões repetidos para cada área | Seções abertas e divisórias finas | Dar prioridade ao conteúdo |
| Abas em uma cápsula | Navegação com sublinhado | Identificar a operação ativa |
| Selos coloridos na tabela | Resultado em texto, com cor complementar | Evitar depender de cor ou de decoração |
| Instruções longas sempre abertas | Ajuda expansível perto da ação | Expor detalhes quando necessários |
| Botões sem transição | Resposta de clique e hover curta | Confirmar a interação sem atraso |
| Rolagem animada em toda comparação | Rolagem imediata por teclado ou com movimento reduzido | Respeitar a forma de navegação |

## Movimento e acesso

- Sublinhado das abas: 200 ms; entrada de seção por clique: 180 ms, com opacidade e deslocamento de 4 px.
- Botões: resposta de pressão de 140 ms e hover discreto. Hover é restrito a dispositivos com ponteiro preciso.
- A troca por teclado é imediata; o foco tem contorno visível. Movimento reduzido desativa deslocamentos e transições.
- Textos, nomes de loja e caminhos podem quebrar linha. A tabela e o código têm rolagem própria quando necessário.
- Confirmação de leitura, nome da loja no envio, comparação de versões, backups e diagnóstico de erros continuam presentes. Abrir o painel não inicia a cópia.
- Tutoriais e textos explicativos são preservados. Botões desabilitados explicam o requisito pendente no hover.
- O painel fora do editor serve somente para orientação. Seu botão navega para o endereço fixo do editor mediante clique; não pode se autenticar como painel de código. Fechamentos atrasados da orientação não desativam o novo painel.

## Distribuição e privacidade

Somente o pacote atual fica disponível nos releases. O histórico Git preserva alterações de código para auditoria e correções, sem acumular instaladores antigos nos releases. A geração local usa `.cache/package/`; ZIPs e hashes são descartáveis depois do upload confirmado. A pasta carregada sem compactação precisa permanecer no computador enquanto estiver instalada. Nenhum tema, exportação, backup ou dado de loja deve entrar no repositório ou no pacote da extensão. Exemplos e testes são fictícios.
