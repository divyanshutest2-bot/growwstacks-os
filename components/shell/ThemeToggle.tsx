'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

// ThemeToggle — flips [data-theme="dark"] on <html>. Light is the default.
// Persists choice to localStorage; reads it on mount (and an inline script in
// the layout applies it pre-paint to avoid a flash). Rendered as a topbar
// .icon-btn so it sits inline with the bell.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('gs-theme');
    setDark(stored === 'dark');
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) {
      root.setAttribute('data-theme', 'dark');
      window.localStorage.setItem('gs-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
      window.localStorage.setItem('gs-theme', 'light');
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      title={dark ? 'Switch to light' : 'Switch to dark'}
      data-testid="theme-toggle"
      className="icon-btn"
    >
      {dark ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
    </button>
  );
}
