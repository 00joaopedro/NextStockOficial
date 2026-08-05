# SEC-017 CSP enforcement inventory

This inventory was produced for SEC-017 before moving executable inline scripts to external local files.

| Page/template | Script inline | Handler inline | Script externo | Correção |
|---|---:|---:|---|---|
| `public/agendaPet.html` | 1 | 0 | `./dist/session-state.js`, `./dist/sidebar.js`, `./Js/agenda-utils.js`, `./dist/agendaPet.js` | moved to `public/Js/csp-extracted/agendaPet-inline1.js` |
| `public/cadastro.html` | 1 | 0 | `./dist/session-state.js`, `./Js/scan-code.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/cadastro-inline1.js` |
| `public/caixa.html` | 1 | 0 | `./dist/session-state.js`, `./Js/scan-code.js`, `./Js/caixa.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/caixa-inline1.js` |
| `public/clientePet.html` | 1 | 0 | `./dist/session-state.js`, `./Js/agenda-utils.js`, `./Js/clientePet.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/clientePet-inline1.js` |
| `public/dashboard.html` | 2 | 0 | `https://cdn.jsdelivr.net/npm/apexcharts`, `./dist/session-state.js`, `./dist/dashboard.js`, `./dist/sidebar.js` | moved wrappers to `public/Js/csp-extracted/dashboard-inline1.js` and `dashboard-inline2.js`; kept the existing ApexCharts CDN as the only third-party script origin |
| `public/despesas.html` | 1 | 0 | `./dist/session-state.js`, `./Js/despesas.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/despesas-inline1.js` |
| `public/dev.html` | 1 | 0 | `./dist/session-state.js` | moved to `public/Js/csp-extracted/dev-inline1.js` |
| `public/fechamento.html` | 1 | 0 | `./dist/session-state.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/fechamento-inline1.js` |
| `public/fornecedor.html` | 1 | 0 | `./dist/session-state.js`, `./Js/fornecedor.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/fornecedor-inline1.js` |
| `public/funcionario.html` | 0 | 5 | `./dist/session-state.js`, `./Js/funcionario.js`, `./dist/sidebar.js` | replaced `onclick` attributes with IDs and listeners in `public/Js/funcionario.js` |
| `public/historico.html` | 1 | 0 | `./dist/session-state.js`, `./Js/historico.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/historico-inline1.js` |
| `public/index.html` | 1 | 0 | `./dist/session-state.js` | moved to `public/Js/csp-extracted/index-inline1.js` |
| `public/loja.html` | 0 | 0 | `/storefront.js` | no change |
| `public/migracao.html` | 1 | 0 | `./dist/session-state.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/migracao-inline1.js` |
| `public/ntfe.html` | 1 | 0 | `./dist/session-state.js`, `./Js/ntfe.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/ntfe-inline1.js` |
| `public/parceiros.html` | 0 | 0 | `./dist/session-state.js`, `./dist/sidebar.js`, `./dist/parceiros.js` | no change |
| `public/pedido.html` | 1 | 0 | `./dist/session-state.js`, `./Js/pedido.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/pedido-inline1.js` |
| `public/perfil.html` | 0 | 0 | `./dist/session-state.js`, `./Js/perfil.js`, `./dist/sidebar.js` | no change |
| `public/produtos.html` | 1 | 1 dynamic legacy comment match | `./dist/session-state.js`, `./dist/sidebar.js` | moved to `public/Js/csp-extracted/produtos-inline1.js`; removed the obsolete commented `onerror` template text |

Notes:

- No `javascript:` URLs were found in HTML pages.
- No executable dynamic script creation, `eval`, `new Function`, or string timers are required by the frontend inventory.
- `style-src 'unsafe-inline'` remains intentionally out of scope for SEC-017 because legacy pages still contain inline `<style>` blocks.
- Required external origins are limited to the existing ApexCharts CDN for scripts, configured CORS/public origins for app API calls, `SUPABASE_URL` origin for assets/connect, and `https://viacep.com.br` for CEP lookup.
