# Navegação mobile vertical

O módulo compartilhado da sidebar instala uma barra superior e um menu lateral
recolhido em telas de até 768px na orientação vertical. As opções continuam vindo
do contexto e das permissões existentes. A troca de orientação fecha o menu,
remove o bloqueio de rolagem e devolve o comportamento anterior do horizontal.
O painel aceita Escape, toque fora e botão Fechar; o foco fica no menu aberto e
retorna ao botão Menu ao fechar. Conteúdo e menu têm rolagens separadas.

Não há migration nem variáveis novas. `npm run build:frontend` gera o novo módulo
em public/dist; publique o resultado junto com a sidebar compilada.

## Layout das páginas

As 24 páginas HTML usam a mesma folha `/Css/mobile-portrait.css`, carregada
depois dos estilos existentes. As regras de adaptação das páginas se aplicam
na orientação vertical até 768px. Em telas estreitas, os grupos de campos e filtros ficam em uma coluna,
os controles ganham área de toque, e tabelas largas rolam dentro da área da
tabela. No Caixa, a lista não reserva mais uma altura mínima quando está vazia.
Os estilos do menu e as regras de permissão da etapa anterior são mantidos.

A verificação local confirmou a inclusão da folha e da viewport nas 24 páginas,
a compilação do frontend e os testes de comportamento. A revisão visual ficou
pendente: o Chromium local não conseguiu criar o socket de execução e o Chrome
remoto não conseguiu acessar a prévia local. Na revisão visual, conferir
Perfil, Caixa, Produtos e Agenda Pet em 360/390/768px e no horizontal, além de
abrir modais, campos com teclado virtual e tabelas com conteúdo real.

## Rolagem no Caixa e fundo das páginas

No horizontal com altura de até 600px, o Caixa deixa a página crescer e rolar,
mantendo as regras de colunas da largura atual. A sidebar continua com sua
própria rolagem. Em Despesas, Histórico, Fechamento e NTF-e, o gradiente fica
numa camada fixa atrás do conteúdo em ambas as orientações, sem se repetir
quando o documento ou o painel interno é rolado.
