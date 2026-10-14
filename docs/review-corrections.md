# Correções do parecer — Billing

CatalogRepository usa uma consulta SQL própria, filtrando catalog: e ativos antes de retornar dados, sem LIMIT 500 de agregados mistos. Índice parcial atende ordenação por criação e ID. Uma regressão com 502 serviços e 501 orçamentos recentes confirma listagem completa e filtro ativo.

DTOs validam Max(99999999.99); excesso retorna HTTP 400 na criação e atualização. A proveniência registra essa adaptação posterior à extração. OpenAPI foi reparado em UTF-8. A leitura continua restrita a admin, como o controller original; o contrato do protótipo em centavos permanece documentado separadamente.

Total zero mantém a rejeição financeira existente: teste real verifica rollback e ausência de orçamento, inbox, outbox e checkout. Definir gratuidade ou ampliar permissões permanece decisão funcional. Imagem GHCR normalizada é output do container reutilizado por deploy.
