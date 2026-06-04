/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this repo so a stray lockfile in a parent dir
  // (e.g. ~/package-lock.json) doesn't get inferred as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // Server actions are enabled by default in the App Router (Next 14+).
  // All server actions / route handlers in this app declare `export const runtime = 'edge'`
  // so they deploy on Cloudflare Pages via @cloudflare/next-on-pages.
};

export default nextConfig;
