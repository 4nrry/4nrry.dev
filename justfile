set shell := ["bash", "-cu"]

default:
    @just --list

# Astro dev server on :4321 (proxies /api to the worker on :8787)
dev:
    pnpm astro dev

# Worker dev server on :8787 with local KV and scheduled-handler testing
dev-worker:
    pnpm wrangler dev --test-scheduled

build:
    pnpm astro build

test:
    pnpm vitest run

# Fire the cron sync against the local worker dev server
sync-local:
    curl -s "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*" && echo

# Regenerate worker-configuration.d.ts from wrangler.jsonc
types:
    pnpm wrangler types

# Build the site and deploy worker + assets
deploy:
    pnpm astro build
    pnpm wrangler deploy

# Assert the public dataset only names allowlisted repos
check-leaks url="http://localhost:8787/api/portfolio.json":
    node scripts/check-leaks.mjs {{url}}
