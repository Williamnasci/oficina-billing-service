# Snapshots de peças e serviços

A cotação mantém o preço persistido do catálogo para itens com serviceId e recebe snapshots de peças com stockItemId da execução, via OS. Uma linha não pode ter as duas referências. O total é calculado em centavos com subtotais de serviços e estoque, que seguem com as linhas no evento QuoteCreated. Alterações posteriores no catálogo/estoque não reprecificam uma cotação criada.

Após recusa, a tentativa cancelada permanece no Billing. A OS cria um novo attemptId após a compensação; a nova cobrança possui referência própria. Isso mantém o histórico e evita que eventos tardios ativem a tentativa corrente.
