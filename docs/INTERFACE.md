# Interface e proposta de nome

## Nome recomendado

`yampi-storefront-code-sync`, com nome de exibição **Yampi Storefront Code Sync**.

Storefront identifica a loja virtual; code identifica os arquivos do editor; sync inclui exportação, comparação e retorno. Extractor sozinho descreve apenas a saída dos arquivos. Theme é o termo técnico do conjunto de arquivos na Yampi, mas code deixa mais evidente a finalidade para quem procura a ferramenta.

O nome é uma proposta. Repositório, pacote e extensão mantêm sua identidade atual nesta versão.

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

Somente o pacote atual fica disponível nos releases. O histórico Git preserva alterações de código para auditoria e correções, sem acumular instaladores antigos nos releases. Nenhum tema, exportação, backup ou dado de loja deve entrar no repositório ou no pacote da extensão. Exemplos e testes são fictícios.
