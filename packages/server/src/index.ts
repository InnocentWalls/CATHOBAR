import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { ConfigStore } from './config-store.js';
import { TickerHub } from './hub.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const defaultDataPath = resolve(repoRoot, 'data', 'config.json');
const webDistDir = resolve(repoRoot, 'packages', 'web', 'dist');

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const configPath = process.env.CATHOBAR_CONFIG ?? defaultDataPath;
  const authToken = process.env.CATHOBAR_TOKEN?.trim() || undefined;

  const store = new ConfigStore(configPath);
  const hub = new TickerHub(store);
  hub.setPort(port);
  await hub.init();

  const app = createApp(hub, {
    staticDir: existsSync(webDistDir) ? webDistDir : undefined,
    authToken,
  });

  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        hub.attachClient(ws);
      });
    } else {
      socket.destroy();
    }
  });

  hub.start();

  console.log(`\n[CATHOBAR] Server listening on http://${host}:${port}`);
  console.log(`  Local display : http://localhost:${port}/`);
  console.log(`  Admin UI      : http://localhost:${port}/admin`);
  console.log(`  Debug sim     : http://localhost:${port}/debug`);
  for (const lanUrl of hub.getLanUrls()) {
    console.log(`  LAN Admin UI  : ${lanUrl}/admin`);
  }
  if (authToken) {
    console.log('  Auth          : enabled (CATHOBAR_TOKEN)');
  }

  const shutdown = () => {
    console.log('\n[CATHOBAR] Shutting down...');
    hub.stop();
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[CATHOBAR] Fatal startup error:', err);
  process.exit(1);
});
