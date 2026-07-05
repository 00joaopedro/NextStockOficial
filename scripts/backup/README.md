# Exemplos de automacao de backup

Scripts reais devem viver em infraestrutura protegida, exigir URLs via variavel
de ambiente, validar o environment/ref, gravar somente em diretorio ignorado e
exigir confirmacao explicita para qualquer origem de producao. Credenciais,
dumps e certificados nunca pertencem ao repositorio.

Antes de adotar automacao, documente criptografia, destino externo, checksum,
retencao, alertas e o procedimento de restore em staging.
