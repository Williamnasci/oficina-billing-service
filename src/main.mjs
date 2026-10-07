import { readFile } from 'node:fs/promises';
import { PostgresStore } from './infrastructure/postgres-store.mjs';
import { Broker } from './infrastructure/broker.mjs';
import { createHttp } from './infrastructure/http.mjs';
import { startWorkers } from './infrastructure/lifecycle.mjs';
import { BillingService, billingRoutes } from './service.mjs';
import { MercadoPago } from './mercado-pago.mjs';

const store = new PostgresStore(process.env.DATABASE_URL);
await store.init();

const service = new BillingService(store, new MercadoPago({ token: process.env.MP_ACCESS_TOKEN, notificationUrl: process.env.MP_NOTIFICATION_URL, collectorId: process.env.MP_COLLECTOR_ID, liveMode: process.env.MP_LIVE_MODE === 'true', ...(process.env.APP_ENV === 'test' && process.env.MP_TEST_API_URL ? { baseUrl: process.env.MP_TEST_API_URL } : {}) }), { webhookSecret: process.env.MP_WEBHOOK_SECRET });
const broker = new Broker({ url: process.env.AMQP_URL, service: 'billing', store, handle: event => service.consume(event), onDisconnect: () => process.exit(1) });
await broker.init();
const spec = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'));
const app = await createHttp({ service: 'billing', store, broker, routes: billingRoutes(service), spec, secret: process.env.JWT_SECRET, port: Number(process.env.PORT ?? 3000) });
const stop = startWorkers(broker, service);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true; stop(); await app.close(); await broker.close(); await store.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
