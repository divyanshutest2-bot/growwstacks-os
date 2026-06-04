# Cloudflare Deployment Changes

This file documents the changes made to get `growwstacks-os` deploying through
Cloudflare's current Workers & Pages application flow.

## Final Cloudflare Settings

Use these values in Cloudflare:

| Setting | Value |
| --- | --- |
| Build command | `npm run cf:build` |
| Deploy command | `npm run cf:deploy` |
| Root directory | `/` |
| Node.js version | `22` |

Required environment variables/secrets:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon database connection string |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_RESEND_KEY` | Resend API key for magic-link emails |
| `AUTH_URL` | `https://growwstacks-os.divyanshutest2.workers.dev` |

Do not add Cloudflare build-token JSON as an app variable.

## Why The Deployment Path Changed

The project was originally prepared for Cloudflare Pages using
`@cloudflare/next-on-pages`, but the Cloudflare dashboard available for this
deployment exposed the newer Workers/OpenNext flow. That flow runs OpenNext
commands such as `opennextjs-cloudflare build`, so the repository needed to be
converted to Cloudflare Workers.

## Dependency Changes

Removed:

```txt
@cloudflare/next-on-pages
```

Added:

```txt
@opennextjs/cloudflare
wrangler
```

The lockfile was regenerated with npm `10.9.2` to match Cloudflare's install
environment. This fixed the Cloudflare install error:

```txt
npm ci can only install packages when package.json and package-lock.json are in sync
Missing: @emnapi/runtime@1.10.0 from lock file
Missing: @emnapi/core@1.10.0 from lock file
```

## Package Scripts Added

Added these scripts to `package.json`:

```json
"cf:build": "opennextjs-cloudflare build",
"cf:deploy": "opennextjs-cloudflare deploy",
"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
"upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
"cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
```

Cloudflare should use the split scripts:

```txt
Build command: npm run cf:build
Deploy command: npm run cf:deploy
```

## New Config Files

Added `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "growwstacks-os",
  "compatibility_date": "2026-06-04",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "growwstacks-os"
    }
  ],
  "images": {
    "binding": "IMAGES"
  }
}
```

Added `open-next.config.ts`:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
```

Added `public/_headers`:

```txt
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

## Next.js Config Change

Updated `next.config.mjs` to initialize OpenNext for local Cloudflare dev:

```js
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

initOpenNextCloudflareForDev();
```

## Runtime Export Changes

Removed all instances of:

```ts
export const runtime = 'edge';
```

OpenNext for Cloudflare Workers does not need these route-level Edge runtime
exports, and the OpenNext docs recommend removing them for Worker deployments.
The existing dynamic route behavior was preserved by leaving `dynamic =
'force-dynamic'` exports in place.

## Gitignore Changes

Added generated Cloudflare/OpenNext output folders to `.gitignore`:

```txt
.open-next/
.wrangler/
```

These are generated locally and should not be committed.

## Errors Fixed

### Missing OpenNext Config

Cloudflare error:

```txt
Commit it and re-run the build.
```

Fix:

```txt
Added wrangler.jsonc
Added open-next.config.ts
```

### Wrong Deployment Target

Cloudflare was running:

```txt
npx opennextjs-cloudflare build
```

while the repo was still configured for:

```txt
@cloudflare/next-on-pages
```

Fix:

```txt
Converted repo to @opennextjs/cloudflare + wrangler
```

### Lockfile Out Of Sync

Cloudflare error:

```txt
Missing: @emnapi/runtime@1.10.0 from lock file
Missing: @emnapi/core@1.10.0 from lock file
```

Fix:

```txt
Regenerated package-lock.json with npm 10.9.2
Committed and pushed the lockfile repair
```

## Verification Performed

These commands passed locally after the changes:

```sh
npm run typecheck
npm run cf:build
```

The final pushed lockfile fix commit was:

```txt
d45a73a Fix Cloudflare npm lockfile
```

## Deployment Checklist

1. Confirm latest `main` is pushed.
2. In Cloudflare, use `npm run cf:build` as the build command.
3. Use `npm run cf:deploy` as the deploy command.
4. Set root directory to `/`.
5. Add all required environment variables.
6. Use **Clear build cache and retry** if Cloudflare reused an old dependency cache.
