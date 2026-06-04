import type { Config } from 'tailwindcss';

// TOKENS-ONLY: every theme value maps to a CSS custom property compiled from
// design/tokens.json → app/tokens.css (via `node scripts/build-tokens.mjs`).
// No raw hex/px here — keeps "no hardcoded colors/spacing" greppable.
// Top-level `theme` (not `extend`) deliberately REPLACES Tailwind's default
// palette/scales so only token values are reachable from utilities.
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',

      // --- basics (tailwindBridge-backed; kept for back-compat) ---
      bg: 'var(--color-bg)',
      surface: 'var(--color-surface)',
      text: 'var(--color-text)',
      'text-muted': 'var(--color-text-muted)',
      border: 'var(--color-border)',
      primary: 'var(--color-primary)',

      // --- surface tiers ---
      app: 'var(--color-bg-app)',
      'surface-raised': 'var(--color-bg-surface-raised)',
      subtle: 'var(--color-bg-subtle)',
      sunken: 'var(--color-bg-sunken)',
      hover: 'var(--color-bg-hover)',
      active: 'var(--color-bg-active)',
      overlay: 'var(--color-bg-overlay)',

      // --- sidebar (dark rail) ---
      sidebar: {
        DEFAULT: 'var(--color-bg-sidebar)',
        hover: 'var(--color-bg-sidebar-hover)',
        active: 'var(--color-bg-sidebar-active)',
        text: 'var(--color-sidebar-text)',
        'text-muted': 'var(--color-sidebar-text-muted)',
        'text-active': 'var(--color-sidebar-text-active)',
        heading: 'var(--color-sidebar-heading)',
      },

      // --- text tiers ---
      ink: {
        DEFAULT: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        inverse: 'var(--color-text-inverse)',
        'on-accent': 'var(--color-text-on-accent)',
        link: 'var(--color-text-link)',
      },

      // --- borders ---
      'border-subtle': 'var(--color-border-subtle)',
      'border-strong': 'var(--color-border-strong)',
      'border-focus': 'var(--color-border-focus)',

      // --- accent variants ---
      accent: {
        DEFAULT: 'var(--color-accent)',
        hover: 'var(--color-accent-hover)',
        active: 'var(--color-accent-active)',
        subtle: 'var(--color-accent-subtle)',
        border: 'var(--color-accent-border)',
        text: 'var(--color-accent-text)',
      },

      // --- semantic feedback (bg / border / text / solid / fg) ---
      success: {
        DEFAULT: 'var(--color-success-solid)',
        bg: 'var(--color-success-bg)',
        border: 'var(--color-success-border)',
        text: 'var(--color-success-text)',
        solid: 'var(--color-success-solid)',
        fg: 'var(--color-success-fg)',
      },
      warning: {
        DEFAULT: 'var(--color-warning-solid)',
        bg: 'var(--color-warning-bg)',
        border: 'var(--color-warning-border)',
        text: 'var(--color-warning-text)',
        solid: 'var(--color-warning-solid)',
        fg: 'var(--color-warning-fg)',
      },
      danger: {
        DEFAULT: 'var(--color-danger-solid)',
        bg: 'var(--color-danger-bg)',
        border: 'var(--color-danger-border)',
        text: 'var(--color-danger-text)',
        solid: 'var(--color-danger-solid)',
        fg: 'var(--color-danger-fg)',
      },
      info: {
        DEFAULT: 'var(--color-info-solid)',
        bg: 'var(--color-info-bg)',
        border: 'var(--color-info-border)',
        text: 'var(--color-info-text)',
        solid: 'var(--color-info-solid)',
        fg: 'var(--color-info-fg)',
      },

      // --- user status dots ---
      status: {
        active: 'var(--color-status-active)',
        away: 'var(--color-status-away)',
        left: 'var(--color-status-left)',
      },

      // --- timeline (delay attribution) ---
      timeline: {
        ourwork: 'var(--color-timeline-ourwork)',
        waiting: 'var(--color-timeline-waiting)',
        blocked: 'var(--color-timeline-blocked)',
      },

      // --- AI insights ---
      ai: {
        positive: 'var(--color-ai-positive)',
        neutral: 'var(--color-ai-neutral)',
        risk: 'var(--color-ai-risk)',
        tint: 'var(--color-ai-tint)',
      },
    },
    spacing: {
      0: '0',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      8: 'var(--space-8)',
      10: 'var(--space-10)',
      12: 'var(--space-12)',
      16: 'var(--space-16)',
      20: 'var(--space-20)',
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      full: 'var(--radius-full)',
    },
    fontFamily: {
      display: 'var(--font-family-display)',
      sans: 'var(--font-family-sans)',
      mono: 'var(--font-family-mono)',
    },
    fontSize: {
      xs: 'var(--font-size-xs)',
      small: 'var(--font-size-small)',
      sm: 'var(--font-size-sm)',
      base: 'var(--font-size-base)',
      body: 'var(--font-size-body)',
      lg: 'var(--font-size-lg)',
      h3: 'var(--font-size-h3)',
      h2: 'var(--font-size-h2)',
      h1: 'var(--font-size-h1)',
      display: 'var(--font-size-display)',
      mono: 'var(--font-size-mono)',
    },
    fontWeight: {
      regular: 'var(--font-weight-regular)',
      medium: 'var(--font-weight-medium)',
      semibold: 'var(--font-weight-semibold)',
      bold: 'var(--font-weight-bold)',
      display: 'var(--font-weight-display)',
    },
    lineHeight: {
      tight: 'var(--font-leading-tight)',
      snug: 'var(--font-leading-snug)',
      normal: 'var(--font-leading-normal)',
    },
    letterSpacing: {
      tight: 'var(--font-tracking-tight)',
      snug: 'var(--font-tracking-snug)',
      normal: 'var(--font-tracking-normal)',
      wide: 'var(--font-tracking-wide)',
      label: 'var(--font-tracking-label)',
    },
    boxShadow: {
      none: 'none',
      xs: 'var(--shadow-xs)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      focus: 'var(--shadow-focus)',
      'focus-danger': 'var(--shadow-focus-danger)',
      1: 'var(--elevation-1)',
      2: 'var(--elevation-2)',
    },
    transitionDuration: {
      instant: 'var(--motion-duration-instant)',
      fast: 'var(--motion-duration-fast)',
      base: 'var(--motion-duration-base)',
      slow: 'var(--motion-duration-slow)',
    },
    transitionTimingFunction: {
      standard: 'var(--motion-ease-standard)',
      out: 'var(--motion-ease-out)',
      in: 'var(--motion-ease-in)',
      spring: 'var(--motion-ease-spring)',
    },
    extend: {},
  },
  plugins: [],
};

export default config;
