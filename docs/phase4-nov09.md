# Snapshots de peças e serviços

A cotação mantém o preço persistido do catálogo para itens com serviceId e recebe snapshots de peças com stockItemId da execução, via OS. Uma linha não pode ter as duas referências. O total é calculado em centavos com subtotais de serviços e estoque, que seguem com as linhas no evento QuoteCreated. Alterações posteriores no catálogo/estoque não reprecificam uma cotação criada.

Após recusa, a tentativa cancelada permanece no Billing. A OS cria um novo attemptId após a compensação; a nova cobrança possui referência própria. Isso mantém o histórico e evita que eventos tardios ativem a tentativa corrente.

## Checkout Pro no sandbox

No ensaio do Checkout Pro, a API de pagamentos devolveu um pagamento aprovado criado pelo checkout sandbox com live_mode igual a true. Para esse cenário, MP_VERIFY_SANDBOX_PREFERENCE=true pode ser configurado somente com APP_ENV=test e MP_LIVE_MODE=false. O Billing confere o vendedor e exige que o pedido comercial retornado pelo Mercado Pago contenha o pagamento, a referência externa e a preferência sandbox gravada no orçamento. O webhook continua exigindo assinatura válida e o valor e a moeda continuam sendo conciliados com o orçamento.
