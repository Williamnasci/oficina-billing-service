# Extração do catálogo da Fase 3

Origem: `Williamnasci/oficina-api`, módulo `service-catalog`. Entidade, DTOs, port e cinco casos de uso foram extraídos sem mudar as regras de negócio; imports recebem sufixos ESM `.js`. Os seis arquivos de testes originais mantêm suas 14 verificações, com import explícito de `jest` nos mocks. [Manifesto de origem](catalog-extraction.json).

Restaurados os contratos originais, restritos a `admin`: POST `/service-catalog` (201 e UUID), GET lista/ID, PATCH (204) e DELETE (204, desativação lógica). Preço permanece em reais; descrição é opcional/nula; serviço inativo aparece nas consultas e não pode ser incluído em novo orçamento. DTO inválido retorna 400; domínio, 422; ausência, 404.

O adapter `CatalogRepository` substitui Prisma pelo PostgreSQL exclusivo do Billing, reutilizando o agregado `catalog:<id>`. Armazena `price` em reais e `unitPriceCents` coerente para o orçamento. Decimal.js arredonda como o `numeric(10,2)` original, incluindo 1,005 -> 1,01, e mantém seu limite de 99.999.999,99. Isso é verificado contra PostgreSQL real. Orçamentos usam o preço do catálogo e preservam snapshots após mudanças; valores enviados pelo cliente não substituem o preço persistido.

A extensão POST `/service-catalog/:id` em centavos do protótipo continua disponível para admin/operator, mantém idempotência e preserva descrição/data de criação. O GET por ID segue agora a resposta/permissão original, documentada no Swagger. Registros antigos sem datas são restaurados com época Unix para não inventar sua criação; novas gravações mantêm as datas reais. Não houve importação automática dos dados do monólito.

## Verificação e limites

`npm run test:cov`: 25 testes nativos e 14 originais, com 97,08% de linhas, 96,75% de branches e 98,83% de funções. Inclui todos os módulos extraídos; só o bootstrap é excluído. `TEST_DATABASE_URL=... npm run test:integration`: duas integrações com PostgreSQL, cobrindo arredondamento, persistência/restart, preço congelado, desativação e ausência de eventos quando a cotação falha. Artefatos LCOV/JSON e BDD são publicados pelo CI.

O catálogo aceita preço zero como a entidade original; o fluxo financeiro atual exige total positivo para iniciar cobrança. Estoque, composição original dos itens, revisão após recusa, total zero, autenticação CPF e migração dos dados ainda exigem extração/regressão antes do corte do monólito.
