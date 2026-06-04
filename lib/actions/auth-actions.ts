'use server';

// lib/actions/auth-actions.ts — thin server-action wrapper around Auth.js signIn
// for the magic-link form. Kept separate from lib/auth.ts (which is the config)
// so the client form imports only a serializable action.

import { AuthError } from 'next-auth';

import { signIn } from '@/lib/auth';

export type SignInResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * requestMagicLink — triggers the Resend Email provider for `email`, redirecting
 * to /contacts after the link is followed. Returns a graceful result instead of
 * throwing so the form can render an error (e.g. before AUTH_RESEND_KEY is set).
 *
 * NOTE: next-auth's signIn issues a redirect on success; we pass redirect:false
 * so this stays a plain data call and the UI shows a "check your email" state.
 */
export async function requestMagicLink(email: string): Promise<SignInResult> {
  const trimmed = email.trim();
  if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  try {
    await signIn('resend', {
      email: trimmed,
      redirectTo: '/contacts',
      redirect: false,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      // Provider not configured (no Resend key) or sign-in declined.
      return {
        ok: false,
        message:
          'Could not send the magic link right now. Email sign-in may not be configured yet — please try again later or contact an admin.',
      };
    }
    // next-auth throws a redirect "error" on success in some flows; rethrow it.
    throw err;
  }
}
