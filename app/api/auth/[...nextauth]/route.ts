// Auth.js v5 catch-all route handler. Edge runtime (Cloudflare Pages).
import { handlers } from '@/lib/auth';

export const runtime = 'edge';
export const { GET, POST } = handlers;
