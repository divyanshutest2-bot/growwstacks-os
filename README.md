# GrowwStacks OS

Next.js application configured for Cloudflare Workers with
`@opennextjs/cloudflare`.

## Deploy To Cloudflare Workers

Use the **Workers & Pages > Create application** flow and select the connected
Git repository.

Use these build settings:

| Setting | Value |
| --- | --- |
| Application name | `growwstacks-os` |
| Build command | `npm run cf:build` |
| Deploy command | `npm run cf:deploy` |
| Root directory | `/` |
| Node.js version | `22` |

The committed `wrangler.jsonc` and `open-next.config.ts` files are required by
the OpenNext build.

## Environment Variables

Add these variables in the Cloudflare application settings:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon connection string using the non-owner app role |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API key for magic-link login emails |
| `AUTH_URL` | `https://growwstacks-os.divyanshutest2.workers.dev` |

Never commit real `.env` files. Use `.env.example` as the template.

## Useful Commands

```sh
npm run dev       # Next.js local development
npm run build     # Regular Next.js production build
npm run cf:build  # Build Cloudflare Worker output
npm run cf:deploy # Deploy previously built Worker output
npm run preview   # Build and preview in the Cloudflare Worker runtime
npm run deploy    # Build and deploy to Cloudflare Workers
```
