# Interface e proposta de nome

## Nome recomendado

`yampi-storefront-code-sync`, com nome de exibição **Yampi Storefront Code Sync**.

Storefront identifica a loja virtual; code identifica os arquivos do editor; sync inclui exportação, comparação e retorno. Extractor sozinho descreve apenas a saída dos arquivos. Theme é o termo técnico do conjunto de arquivos na Yampi, mas code deixa mais evidente a finalidade para quem procura a ferramenta.

O nome é uma proposta. Repositório, pacote e extensão mantêm sua identidade atual nesta versão.

## Direção aplicada na 0.3.1

Uma ferramenta de trabalho compacta, com fundo quase branco, texto em grafite e azul reservado para links e foco. Sem fontes remotas, bibliotecas novas, cartões repetidos, selos encapsulados ou bolinhas de conexão. A loja permanece no cabeçalho durante toda a operação.

| Antes | Depois | Motivo |
| --- | --- | --- |
| Cartões arredondados para cada área | Seções abertas e divisórias finas | Dar prioridade ao conteúdo |
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

## Distribuição e privacidade

Somente o pacote atual fica disponível nos releases. O histórico Git preserva alterações de código para auditoria e correções, sem acumular instaladores antigos nos releases. Nenhum tema, exportação, backup ou dado de loja deve entrar no repositório ou no pacote da extensão. Exemplos e testes são fictícios.
