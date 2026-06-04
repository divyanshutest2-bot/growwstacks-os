# GrowwStacks OS

Next.js application prepared for deployment on Cloudflare Pages using
`@cloudflare/next-on-pages`.

## Deploy to Cloudflare Pages

This app uses dynamic Next.js routes, Auth.js, Neon, and Edge runtime route
handlers. The repository already includes the Cloudflare build dependency and a
Pages build script.

### 1. Create a Cloudflare Pages project

In the Cloudflare dashboard:

1. Go to **Workers & Pages**.
2. Create a **Pages** project.
3. Connect the Git repository.
4. Use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Build command | `npm run pages:build` |
| Build output directory | `.vercel/output/static` |
| Root directory | `/` |
| Node.js version | `22` |

Cloudflare's current Pages build configuration docs list Next.js with
`npx @cloudflare/next-on-pages@1` and `.vercel/output/static`.

### 2. Add environment variables

Set these variables in **Pages > Settings > Environment variables** for
production and preview as needed:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon connection string using the non-owner app role |
| `AUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API key for magic-link login emails |
| `AUTH_URL` | Production URL, for example `https://os.growwstacks.com` |

Never commit real `.env` files. Use `.env.example` as the template.

### 3. Deploy from Git

The recommended path is Git integration:

```sh
git push
```

Cloudflare will run `npm run pages:build` in its Linux build environment and
publish `.vercel/output/static`.

Do not run `npm run pages:build` from native Windows. The
`@cloudflare/next-on-pages` CLI runs the Vercel CLI internally, and that
combination is unreliable on Windows. If you need to test the Cloudflare Pages
build locally, use WSL or Linux:

```sh
npm ci
npm run pages:build
```

### 4. Custom domain

After the first successful deploy:

1. Open the Pages project in Cloudflare.
2. Go to **Custom domains**.
3. Add the production domain.
4. Update `AUTH_URL` to the final HTTPS domain.
5. Redeploy so Auth.js uses the correct callback URL.

## Useful Commands

```sh
npm run build        # Verify the regular Next.js production build
npm run pages:build  # Build Cloudflare Pages output in WSL/Linux or Cloudflare CI
```
