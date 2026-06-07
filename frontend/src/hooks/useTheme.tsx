import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

// Theme is a single mode with four values. light/dark/ultra are explicit;
// `system` follows the OS `prefers-color-scheme`. The legacy boolean keys are
// migrated once into this single key.
export type ThemeMode = 'light' | 'dark' | 'ultra' | 'system';

const STORAGE_MODE = 'theme-mode';
const STORAGE_DARK = 'dark-mode'; // legacy
const STORAGE_ULTRA = 'isUltraDarkThemeEnabled'; // legacy

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'ultra', 'system'];

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  if (mode === 'system') return systemDark;
  return mode === 'dark' || mode === 'ultra';
}

function readInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_MODE);
  if (stored && (THEME_MODES as readonly string[]).includes(stored)) return stored as ThemeMode;
  // Migrate from the old two-boolean scheme (default was dark).
  if (localStorage.getItem(STORAGE_ULTRA) === 'true') return 'ultra';
  const darkRaw = localStorage.getItem(STORAGE_DARK);
  return darkRaw === 'false' ? 'light' : 'dark';
}

function applyDom(isDark: boolean, isUltra: boolean) {
  document.body.setAttribute('class', isDark ? 'dark' : 'light');
  if (isUltra) {
    document.documentElement.setAttribute('data-theme', 'ultra-dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const msg = document.getElementById('message');
  if (msg) msg.className = isDark ? 'dark' : 'light';
}

// module load so the document is in the right theme before React mounts.
const initialMode = readInitialMode();
const initialSystemDark = prefersDark();
applyDom(resolveDark(initialMode, initialSystemDark), initialMode === 'ultra');

const DARK_TOKENS = {
  colorBgBase: '#1a1b1f',
  colorBgLayout: '#1a1b1f',
  colorBgContainer: '#23252b',
  colorBgElevated: '#2d2f37',
};
const ULTRA_DARK_TOKENS = {
  colorBgBase: '#000',
  colorBgLayout: '#000',
  colorBgContainer: '#101013',
  colorBgElevated: '#1a1a1e',
};
const DARK_LAYOUT_TOKENS = {
  bodyBg: '#1a1b1f',
  headerBg: '#15161a',
  headerColor: '#ffffff',
  footerBg: '#1a1b1f',
  siderBg: '#15161a',
  triggerBg: '#23252b',
  triggerColor: '#ffffff',
};
const ULTRA_DARK_LAYOUT_TOKENS = {
  bodyBg: '#000',
  headerBg: '#050507',
  headerColor: '#ffffff',
  footerBg: '#000',
  siderBg: '#050507',
  triggerBg: '#1a1a1e',
  triggerColor: '#ffffff',
};
const DARK_MENU_TOKENS = {
  darkItemBg: '#15161a',
  darkSubMenuItemBg: '#1a1b1f',
  darkPopupBg: '#23252b',
};
const ULTRA_DARK_MENU_TOKENS = {
  darkItemBg: '#050507',
  darkSubMenuItemBg: '#000',
  darkPopupBg: '#101013',
};
const DARK_CARD_TOKENS = {
  colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
};
const ULTRA_DARK_CARD_TOKENS = {
  colorBorderSecondary: 'rgba(255, 255, 255, 0.04)',
};
const STATISTIC_TOKENS = {
  contentFontSize: 17,
  titleFontSize: 11,
};

export function buildAntdThemeConfig(isDark: boolean, isUltra: boolean): ThemeConfig {
  if (!isDark) {
    return {
      algorithm: antdTheme.defaultAlgorithm,
      components: {
        Statistic: STATISTIC_TOKENS,
      },
    };
  }
  return {
    algorithm: antdTheme.darkAlgorithm,
    token: isUltra ? ULTRA_DARK_TOKENS : DARK_TOKENS,
    components: {
      Layout: isUltra ? ULTRA_DARK_LAYOUT_TOKENS : DARK_LAYOUT_TOKENS,
      Menu: isUltra ? ULTRA_DARK_MENU_TOKENS : DARK_MENU_TOKENS,
      Card: isUltra ? ULTRA_DARK_CARD_TOKENS : DARK_CARD_TOKENS,
      Statistic: STATISTIC_TOKENS,
    },
  };
}

export function pauseAnimationsUntilLeave(elementId: string): void {
  document.documentElement.setAttribute('data-theme-animations', 'off');
  const el = document.getElementById(elementId);
  if (!el) return;
  const restore = () => {
    document.documentElement.removeAttribute('data-theme-animations');
    el.removeEventListener('mouseleave', restore);
    el.removeEventListener('touchend', restore);
  };
  el.addEventListener('mouseleave', restore);
  el.addEventListener('touchend', restore);
}

interface ThemeContextValue {
  /** The selected mode: light | dark | ultra | system. */
  mode: ThemeMode;
  /** Set the mode explicitly (persisted). */
  setMode: (mode: ThemeMode) => void;
  /** Advance to the next mode: light → dark → ultra → system → light. */
  cycleMode: () => void;
  /** Effective dark state (resolves `system` against the OS preference). */
  isDark: boolean;
  /** Effective ultra-dark state. */
  isUltra: boolean;
  // Back-compat helpers (used by older callers): toggle light↔dark / dark↔ultra.
  toggleTheme: () => void;
  toggleUltra: () => void;
  antdThemeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [systemDark, setSystemDark] = useState<boolean>(initialSystemDark);

  // Track the OS preference so `system` mode reacts live to light/dark changes.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const isDark = resolveDark(mode, systemDark);
  const isUltra = mode === 'ultra';

  useEffect(() => {
    applyDom(isDark, isUltra);
    localStorage.setItem(STORAGE_MODE, mode);
  }, [mode, isDark, isUltra]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const cycleMode = useCallback(
    () => setModeState((m) => THEME_MODES[(THEME_MODES.indexOf(m) + 1) % THEME_MODES.length]),
    [],
  );
  const toggleTheme = useCallback(() => setModeState((m) => (m === 'light' ? 'dark' : 'light')), []);
  const toggleUltra = useCallback(() => setModeState((m) => (m === 'ultra' ? 'dark' : 'ultra')), []);

  const antdThemeConfig = useMemo(() => buildAntdThemeConfig(isDark, isUltra), [isDark, isUltra]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, cycleMode, isDark, isUltra, toggleTheme, toggleUltra, antdThemeConfig }),
    [mode, setMode, cycleMode, isDark, isUltra, toggleTheme, toggleUltra, antdThemeConfig],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
