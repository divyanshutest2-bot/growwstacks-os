import type { Metadata } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
// Design-prototype CSS, loaded AFTER globals so the ported chrome class rules
// (.app/.ni/.tbl…) win over Tailwind's reset. compat (token aliases) precedes
// shell so the short token names it defines are available to shell's rules.
import './design-compat.css';
import './design-shell.css';

// Self-hosted via next/font (NOT the render-blocking Google @import, which fell
// back to system fonts). These expose CSS variables that the token font stacks
// in design-compat.css consume (--font-bricolage / --font-hanken / --font-plex-mono).
// Bricolage + Hanken are variable fonts (weight axis) → no explicit weight.
const fontDisplay = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--font-bricolage' });
const fontSans = Hanken_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-hanken' });
const fontMono = IBM_Plex_Mono({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'GrowwStacks OS',
  description: 'AI-first internal operating system',
};

// Applies the stored theme before first paint to avoid a light→dark flash.
// Light is the default (no attribute); dark sets [data-theme="dark"] on <html>.
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem('gs-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
