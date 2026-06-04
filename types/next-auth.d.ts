// Module augmentation so session.user.id / .role and the JWT carry our fields.
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string | null;
    } & DefaultSession['user'];
  }
}

// Auth.js v5: the JWT type lives in @auth/core/jwt (re-exported by next-auth/jwt).
// Augment the source module so the added fields are strongly typed.
declare module '@auth/core/jwt' {
  interface JWT {
    uid?: string;
    role?: string | null;
    lastChecked?: number;
  }
}
