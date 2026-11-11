# Navegação mobile vertical — etapa 1

O módulo compartilhado da sidebar instala uma barra superior e um menu lateral
recolhido em telas de até 768px na orientação vertical. As opções continuam vindo
do contexto e das permissões existentes. A troca de orientação fecha o menu,
remove o bloqueio de rolagem e devolve o comportamento anterior do horizontal.
O painel aceita Escape, toque fora e botão Fechar; o foco fica no menu aberto e
retorna ao botão Menu ao fechar. Conteúdo e menu têm rolagens separadas.

Não há migration nem variáveis novas. `npm run build:frontend` gera o novo módulo
em public/dist; publique o resultado junto com a sidebar compilada.

Verificação local: testes de estado da navegação, compilação frontend e checagem
estática. O Chromium local não pôde iniciar por restrição de socket no ambiente;
a revisão visual ainda precisa ser feita. Na revisão, conferir Perfil, Caixa,
Produtos e Agenda Pet em 360/390/768px, com teclado virtual e em horizontal.
Esta etapa corrige a estrutura compartilhada; tabelas, formulários e o arranjo
interno do Caixa serão tratados na etapa 2.
