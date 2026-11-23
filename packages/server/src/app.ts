import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { PushMessageInputSchema, TickerSourceIdSchema } from '@cathobar/shared';
import type { TickerHub } from './hub.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export interface AppOptions {
  staticDir?: string;
}

export function createApp(hub: TickerHub, options: AppOptions = {}): Hono {
  const app = new Hono();

  app.use('/api/*', cors());

  app.get('/api/health', (c) => {
    return c.json({ ok: true, service: 'cathobar', timestamp: Date.now() });
  });

  app.get('/api/state', (c) => {
    return c.json(hub.getState());
  });

  app.get('/api/config', (c) => {
    return c.json(hub.getConfig());
  });

  app.patch('/api/config', async (c) => {
    try {
      const body = await c.req.json();
      const updated = await hub.updateConfig(body);
      return c.json(updated);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: 'Invalid configuration payload', issues: err.issues }, 400);
      }
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to update config' },
        400,
      );
    }
  });

  app.post('/api/push', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = PushMessageInputSchema.parse(body);
      const item = hub.pushMessage(parsed);
      return c.json({ ok: true, item }, 201);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: 'Invalid push payload', issues: err.issues }, 400);
      }
      return c.json({ error: 'Failed to parse JSON body' }, 400);
    }
  });

  app.post('/api/sources/:id/refresh', async (c) => {
    const idResult = TickerSourceIdSchema.safeParse(c.req.param('id'));
    if (!idResult.success) {
      return c.json({ error: 'Unknown source id' }, 404);
    }
    const ok = await hub.refreshSource(idResult.data);
    return c.json({ ok, id: idResult.data });
  });

  app.get('/api/geocode', async (c) => {
    const query = c.req.query('q')?.trim() ?? '';
    if (query.length < 1) {
      return c.json({ results: [] });
    }
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', query);
      url.searchParams.set('count', '8');
      url.searchParams.set('language', 'ja');
      url.searchParams.set('format', 'json');
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) {
        return c.json({ results: [], error: `Geocoding HTTP ${res.status}` }, 502);
      }
      const json = (await res.json()) as {
        results?: Array<{
          name: string;
          latitude: number;
          longitude: number;
          country?: string;
          admin1?: string;
        }>;
      };
      return c.json({ results: json.results ?? [] });
    } catch (err) {
      return c.json(
        { results: [], error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  });

  const staticRoot = options.staticDir ? resolve(options.staticDir) : null;
  if (staticRoot && existsSync(staticRoot)) {
    app.get('*', async (c) => {
      const reqPath = c.req.path;
      if (reqPath.startsWith('/api/') || reqPath === '/ws') {
        return c.notFound();
      }

      const relPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      const candidate = resolve(staticRoot, relPath);
      if (candidate.startsWith(`${staticRoot}${sep}`) || candidate === staticRoot) {
        const served = await tryServeFile(candidate);
        if (served) {
          return new Response(new Uint8Array(served.data), {
            status: 200,
            headers: { 'Content-Type': served.mime },
          });
        }
      }

      const indexFile = resolve(staticRoot, 'index.html');
      const indexServed = await tryServeFile(indexFile);
      if (indexServed) {
        return new Response(new Uint8Array(indexServed.data), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return c.notFound();
    });
  }

  return app;
}

async function tryServeFile(
  filePath: string,
): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const data = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    return { data, mime };
  } catch {
    return null;
  }
}
