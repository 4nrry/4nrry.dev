import { DATASET_KEY, readMeta, runSync } from './sync';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i]! ^ bytesB[i]!;
  return diff === 0;
}

async function servePortfolio(request: Request, env: Env): Promise<Response> {
  const { value, metadata } = await env.PORTFOLIO_KV.getWithMetadata<{ generatedAt?: string }>(
    DATASET_KEY,
    'text',
  );
  if (value === null) {
    return json({ status: 'pending' }, 503, { 'retry-after': '60', 'cache-control': 'no-store' });
  }
  const etag = `"${metadata?.generatedAt ?? 'unknown'}"`;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    etag,
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(value, { status: 200, headers });
}

async function handleManualSync(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!env.SYNC_SECRET || !token || !constantTimeEqual(token, env.SYNC_SECRET)) {
    return json({ error: 'unauthorized' }, 401);
  }
  try {
    return json(await runSync(env));
  } catch (error) {
    return json({ error: String(error).slice(0, 500) }, 500);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === 'www.4nrry.dev') {
      url.hostname = '4nrry.dev';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/portfolio.json' && (request.method === 'GET' || request.method === 'HEAD')) {
        return servePortfolio(request, env);
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        const meta = await readMeta(env);
        return json(meta ?? { lastSuccessAt: null, lastError: null }, 200, {
          'cache-control': 'no-store',
        });
      }
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        return handleManualSync(request, env);
      }
      return json({ error: 'not found' }, 404);
    }

    // Anything else that reached the worker missed the static assets:
    // delegate back to the assets binding for its 404 handling.
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runSync(env).catch((error) => {
        console.error('scheduled sync failed:', String(error));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
