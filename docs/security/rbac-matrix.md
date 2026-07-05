# Matriz RBAC atual

O backend e a fonte da verdade. A sidebar apenas oculta opcoes sem autorizacao.
Nao existem capabilities nesta fase.

`EmployeeRole` mapeia: `admin -> Admin`, `gerente/caixa -> Vendedor` e
`funcionario/estoque -> Comprador`.

| Modulo                      | Admin                             | Vendedor                            | Comprador                 | Dev SuperAdmin               |
| --------------------------- | --------------------------------- | ----------------------------------- | ------------------------- | ---------------------------- |
| Dashboard                   | completo                          | operacional sem financeiro sensivel | produtos/estoque          | workspace; suporte explicito |
| Produtos                    | CRUD/upload                       | listar/lookup                       | listar                    | conforme contexto            |
| Pedidos                     | CRUD/cancelar                     | listar/criar/editar/status          | nenhum                    | conforme contexto            |
| Vendas/caixa/historico      | criar/listar/cancelar             | criar/listar/recibo                 | nenhum                    | conforme contexto            |
| Fornecedores                | CRUD                              | listar                              | listar                    | conforme contexto            |
| Despesas                    | CRUD/status/anexos                | listar                              | criar/editar/anexos       | conforme contexto            |
| Funcionarios/usuarios/roles | gerenciar                         | nenhum                              | nenhum                    | suporte auditado             |
| Perfil                      | proprio e empresa                 | proprio/leitura empresa             | proprio/leitura empresa   | contexto selecionado         |
| Billing                     | checkout/sync/status              | status resumido                     | status resumido           | suporte auditado             |
| Fiscal                      | configuracao/emissao/cancelamento | consulta/rascunho/status            | nenhum                    | suporte auditado             |
| Pet shop                    | CRUD                              | criar/editar/agenda/foto            | leitura                   | conforme contexto            |
| Parceiros/dev               | nenhum                            | nenhum                              | nenhum                    | exclusivo                    |
| Uploads                     | conforme modulo                   | pets quando permitido               | despesas quando permitido | conforme contexto            |

`superAdmin` nunca pode ser atribuido por DTO de tenant. Alteracoes de role
propria sao negadas. A manutencao futura deve manter controller, service,
sidebar e testes de matriz sincronizados.
