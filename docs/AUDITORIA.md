# Auditoria de desempenho — 0.3.4

Auditoria executada em 09/10/2026, Windows e Node.js 24.15.0. A versão 0.3.4 reduz trabalho repetido na cópia e compactação, mantém a interface responsiva e distribui uma imagem de assinatura adequada ao tamanho exibido. Todos os conteúdos de teste são fictícios.

## Medições

| Etapa | 0.3.3 | 0.3.4 | Resultado |
|---|---:|---:|---|
| Preparar ZIP, mediana de três execuções | 277,78 ms | 128,73 ms | 54% menos tempo |
| Capturar 24 recursos públicos, mediana | 611,29 ms | 156,14 ms | 74% menos tempo |
| Concorrência máxima de recursos públicos | 1 | 4 | Quatro GETs por lote |
| GETs em duas rodadas de autorização da mesma exportação | 3 | 2 | Resposta válida reaproveitada |
| Imagem de assinatura distribuída | 1.158.905 bytes | 2.174 bytes | Original preservado fora do instalador |
| Instalador da extensão | 1.056.798 bytes | 145.130 bytes | 86% menor |
| ZIP da fixture de 250 textos e quatro PNGs | 6.504.904 bytes | 6.503.759 bytes | Bytes do código e das imagens preservados |

A referência anterior é o commit `bc0168660086e766bcc8082e797af8c8371a9a38` da 0.3.3. O benchmark usa os mesmos 250 textos sintéticos e quatro PNGs válidos gerados com dados determinísticos. Cada ZIP é reimportado para conferir texto, baseline e imagens byte a byte. O download simula 25 ms por resposta para 24 SVGs. A fixture de permissões apresenta uma origem adicional em uma segunda rodada.

Esses percentuais medem etapas controladas. A duração de uma exportação real também depende da rede, do número de arquivos e do carregamento de cada documento na Yampi. A leitura do editor permanece sequencial e conserva a janela de estabilidade; a auditoria não mediu um novo export real. O ganho principal no ZIP é o tempo de preparação, sem promessa de reduzir o tamanho de imagens da loja.

## Alterações aplicadas

- O worker combina a conferência de versão do adaptador e seu comando em uma chamada ao `MAIN`. Após reload ou versão diferente, injeta novamente. As verificações de sessão, loja e acesso continuam ativas.
- A árvore calcula cada caminho uma vez por inventário. Para leitura, resolve somente candidatos com nome e caminho completo correspondentes. Inventários completos continuam antes e depois da captura e em cada escrita.
- A estabilização observa a identidade do documento imutável do CodeMirror. O documento completo é lido e validado ao terminar; a janela de estabilidade e os indicadores de carregamento/rascunho permanecem iguais.
- Imagens, fontes e CSS públicos usam até quatro GETs simultâneos. Resultados são incorporados em ordem, com orçamento determinístico. Cancelar aguarda as requisições já iniciadas antes de liberar a operação.
- Cada exportação guarda somente respostas válidas em seu próprio cache. Novas autorizações reaproveitam essas respostas com os dados e URLs originais intactos. Falhas são tentadas novamente; outras exportações começam sem cache. A origem precisa continuar autorizada, inclusive para um resultado em cache.
- O worker autenticado continua conferindo a identidade antes e depois de cada GET. A chamada redundante ao contexto no painel foi retirada.
- PNG, JPEG, WebP e WOFF2 usam ZIP STORE: são formatos já comprimidos, então seus bytes entram sem uma segunda compressão. Texto, SVG e CSS usam DEFLATE sem perda. O empacotador de retorno aplica a mesma regra.
- A preparação do ZIP da exportação usa um worker local incluído no pacote. Entradas são clonadas, preservando os buffers de originais e backups; somente o resultado é transferido. Sucesso, erro e cancelamento encerram o worker. Permissões e CSP são preservadas.
- A assinatura de 18 px usa um PNG de 72×72 px, gerado do original autorizado. O original está em `assets/zirtuno-logo-source.png`, junto do código de desenvolvimento, sem integrar o instalador.

Código, imagens de lojas, manifesto de hashes e baseline continuam íntegros. Logs do editor permanecem excluídos conforme o formato anterior. O instalador usa allowlist de 17 arquivos: nenhuma fixture, captura de tela, dependência de desenvolvimento ou exportação de loja entra nele.

## Limpeza local

Foram removidos 37 arquivos temporários identificados: 33 capturas antigas de interface, três arquivos de instaladores antigos (ZIPs/hash) e uma captura de erro obsoleta. Total: 3.537.572 bytes. As evidências atuais, logos originais e projetos privados foram preservados. A revisão automática bloqueou a exclusão recursiva das pastas de cache; a limpeza ficou restrita aos arquivos regulares identificados individualmente. Caches restantes são ignorados pelo Git e ficam fora do instalador.

## Verificação

145 testes em dez arquivos passaram. Os fluxos de painel lateral nativo, leitura integral das duas associações do CodeMirror, exportação, projeto portátil, importação, backup, envio fictício/reload e restauração protegida passaram. Duas prévias fictícias independentes foram compiladas, movidas e executadas com recursos locais; as quatro comparações visuais descritas em [Validação](VALIDACAO.md) passaram. Nenhuma requisição alcançou uma loja real e a cópia realizou zero mutações no editor fictício.

O teste específico do worker passou em Chromium temporário com 5.575.444 bytes de entrada, conteúdo do ZIP igual às entradas originais, preservação dos buffers, cancelamento e encerramento. O timer da interface avançou 11 vezes durante o trabalho. Inicializar um worker tem custo, então esse teste verifica resposta da interface, sem garantir menor duração total em pacotes pequenos.

## Reproduzir

```powershell
npm ci
npm run check
npm run test:e2e
npm run test:preview
npm run test:compression
node scripts/performance-audit.mjs baseline --ref=bc0168660086e766bcc8082e797af8c8371a9a38
node scripts/performance-audit.mjs optimized
npm run package
```

`npm run audit:performance` executa somente a medição atual. O script gera fixtures e bundles em `.cache/performance/`, materializando apenas arquivos rastreados de `src/` e `local-runtime/` da referência Git indicada. Não troca o checkout, não lê exports privados e não acessa a Yampi. Os relatórios incluem amostras, mediana, tamanho do ZIP, concorrência e verificações de integridade.

Referências de implementação: [ZIP STORE e opções por arquivo no fflate](https://github.com/101arrowz/fflate) e [CSP de extensões Chrome](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
