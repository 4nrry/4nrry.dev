# 4nrry.dev

Personal portfolio that replays two years of GitHub activity, inspired by
[akitaonrails/github-visualize](https://github.com/akitaonrails/github-visualize).

## How it works

A single Cloudflare Worker does three jobs:

- serves the static Astro site (assets binding);
- a cron trigger (`0 */6 * * *`) syncs GitHub data via GraphQL into Workers KV;
- a tiny API serves the precomputed dataset: `GET /api/portfolio.json`,
  `GET /api/health`, `POST /api/sync` (bearer-protected bootstrap/debug).

The sync pipeline is allowlist-only: per-repo queries are generated exclusively
from `worker/config.ts`, and `worker/sanitize.ts` walks the final dataset before
every KV write. Repositories outside the allowlist only ever appear inside
aggregate counts. Sync failures never clear the last good dataset.

## Stack

Astro 6, Tailwind 4, vanilla TypeScript canvas animations (no chart libraries),
Cloudflare Workers + KV, vitest.

## Development

```bash
pnpm install
just dev-worker   # wrangler dev on :8787 (needs .dev.vars)
just dev          # astro dev on :4321, proxies /api to :8787
just sync-local   # fire the cron handler against the local worker
just test         # vitest (sanitizer + aggregation)
```

`.dev.vars` (gitignored) needs `GITHUB_TOKEN` (read-only PAT) and `SYNC_SECRET`.

## Deploy

```bash
just deploy
```

Secrets in production are managed with `wrangler secret put GITHUB_TOKEN` and
`wrangler secret put SYNC_SECRET`. To rotate, run the same command again.
