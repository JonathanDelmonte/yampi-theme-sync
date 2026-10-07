# Validação da versão 0.2

Execução local em 07/10/2026, Node.js 24.15.0, Windows. Os testes usam somente dados fictícios.

## Verificações reproduzíveis

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run package
```

Os testes de unidade cobrem comparação entre original/local/remoto, hashes, limites de extração, caminhos Windows, imagens, exportação antiga, importação da pasta inteira, ZIP com pasta externa, integridade da origem, preflight, backup, cancelamento, envio parcial, isolamento de sessões e histórico por loja. O runtime local também é verificado contra leitura de arquivos fora do tema, links, escrita HTTP e hosts externos.

O teste de navegador instala uma cópia temporária da extensão Manifest V3 em um perfil Chromium próprio. Toda requisição à origem do painel Yampi é interceptada e substituída pelo editor fictício; requisições externas não previstas são abortadas. A cópia temporária recebe uma permissão de host exclusiva do teste. A extensão distribuída continua usando `activeTab`, sem essa permissão adicional.

O fluxo verificado inclui documento com 2.000 linhas, nomes iguais em diretórios diferentes, PNG, projeto exportado instalado com `npm ci`, compilação Twig/Sass/Vue 2 e CSS scoped, interação Vue no navegador, imagem servida localmente, seleção real da pasta com dependências ignoradas, ZIP de retorno, arquivo novo bloqueado, backup persistido/baixado, gravação e conferência após reload, histórico após reabrir o painel, proteção de uma alteração posterior durante restauração, rejeição de origem adulterada e zero acionamentos de publicação.

## Estado do painel real

A interface e a gravação reais da Yampi ainda não foram validadas nesta versão. O proprietário relatou indisponibilidade da plataforma. Os testes acima não certificam o clique no ícone com `activeTab`, a estabilidade dos seletores reais, o carregamento completo de árvores dinâmicas nem a equivalência entre preview e bytes das imagens na plataforma.

Uma próxima validação real deve começar pela exportação e conferência do inventário. Qualquer teste real de gravação depende de instruções específicas do proprietário sobre a loja de teste e o arquivo escolhido. Nunca publique automaticamente. A prévia local é parcial e utiliza dados fictícios; não substitui a prévia final da Yampi.
