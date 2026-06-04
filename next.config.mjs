import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this repo so a stray lockfile in a parent dir
  // (e.g. ~/package-lock.json) doesn't get inferred as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;

initOpenNextCloudflareForDev();
