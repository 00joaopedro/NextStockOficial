# Inventario de dados

| Dominio          | Classificacao           | Exemplos                    | Exclusao                    |
| ---------------- | ----------------------- | --------------------------- | --------------------------- |
| Profiles/users   | pessoal                 | nome, email, IDs Auth       | anonimizar quando permitido |
| Employees        | pessoal/RH              | nascimento, cargo, admissao | preservar obrigacoes        |
| Tenant/branch    | empresarial/pessoal     | CNPJ, contato               | regra contratual/fiscal     |
| Pet clients/pets | pessoal                 | contato, endereco, fotos    | anonimizar/remover storage  |
| Orders/sales     | comercial/financeiro    | cliente, itens, valores     | preservar prazo legal       |
| Billing          | financeiro              | pagamentos, gateway refs    | preservar prazo legal       |
| Fiscal           | fiscal/sensivel         | XML, PDF, CNPJ, A1          | nao apagar livremente       |
| Partners         | pessoal/financeiro      | telefone, conta, referral   | minimizar/reter             |
| Expenses/files   | financeiro/documental   | anexos, fornecedor          | preservar prazo aplicavel   |
| Audit/sessions   | seguranca               | ator, hashes IP/UA          | retencao definida           |
| Usage            | analytics identificavel | pagina, email/nome legado   | 90 dias, depois agregar     |
| StoredFile       | seguranca/operacional   | hash, path, MIME, tamanho   | tombstone e limpeza         |

Tokens, cookies, senhas, service role, senha/PFX do certificado e signed URLs
nao pertencem a exportacoes comuns.
