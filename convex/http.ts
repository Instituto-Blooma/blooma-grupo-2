import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { receberWebhook, verificarWebhook } from './canal';

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: '/whatsapp/webhook', method: 'GET', handler: verificarWebhook });
http.route({ path: '/whatsapp/webhook', method: 'POST', handler: receberWebhook });

export default http;
