import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const app = createApp({ distPath: path.resolve(__dirname, '../dist') });
const server = app.listen(port, () => console.log(`Server listening on port ${port}`));
// This app has no WebSocket API or general-purpose provider proxy.
server.on('upgrade', (_request, socket) => socket.destroy());
