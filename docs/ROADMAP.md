# Próximas etapas

## Validação controlada do adaptador real

1. Instalar a versão local e validar `activeTab`, isolamento de painel/worker e permissões no navegador utilizado.
2. Exportar uma loja autorizada, conferir o inventário, os hashes e arquivos de mesmo nome em pastas distintas. Verificar tempos de carregamento em rede lenta.
3. Usar uma loja de teste ou um tema em rascunho expressamente escolhido pelo usuário para validar salvar, histórico de versões, recarregamento e restauração. Nunca publicar automaticamente.
4. Testar falha de conexão, interrupção durante save e troca de tema; fortalecer a identificação oficial de loja/tema se a interface fornecer esse dado.

## Arquivos novos e imagens do tema

Investigar os controles reais de criação de arquivos. A Yampi restringe os tipos e não permite criar pastas livremente. Novos caminhos devem ter uma etapa explícita de criação, conferir a ausência antes de criar e impedir duplicatas. Implementar download/upload binário para imagens dos assets somente após validar seu fluxo específico. Renomear e excluir exigem um desenho separado de recuperação; continuam desativados.

## Configurações e catálogo

São dados distintos dos arquivos do tema. Planejar exportação de configurações visuais, produtos, variações, preços e imagens de catálogo usando os meios oficialmente disponíveis e as permissões necessárias. A importação desses dados deve considerar IDs, estoque, campos obrigatórios e alterações que afetam a operação da loja. Não tratá-los como simples arquivos de código.

## Manutenção

Histórico de múltiplas lojas, recuperação de uma exportação interrompida, comparação visual por linhas e validações locais de código podem ser adicionados depois da validação do fluxo básico. O repositório permanece privado. Uma distribuição para terceiros, se pedida no futuro, pode compartilhar apenas o pacote da ferramenta, sem revelar o código/dados dos projetos das lojas.
