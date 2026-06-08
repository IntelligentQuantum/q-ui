import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// Two themes only: light and dark. (The old `ultra`/OLED and `system`/auto modes
// were removed at the user's request.) Legacy stored values are migrated once.
export type ThemeMode = 'light' | 'dark';

const STORAGE_MODE = 'theme-mode';
const STORAGE_DARK = 'dark-mode'; // legacy boolean

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark'];

function readInitialMode(): ThemeMode
{
    const stored = localStorage.getItem(STORAGE_MODE);
    if (stored === 'light')
    {
        return 'light';
    }
    if (stored === 'dark')
    {
        return 'dark';
    }
    // Migrate legacy values: removed 'ultra'/'system' collapse to dark; the old
    // two-boolean scheme defaulted to dark when unset.
    if (stored === 'ultra' || stored === 'system')
    {
        return 'dark';
    }
    const darkRaw = localStorage.getItem(STORAGE_DARK);
    return darkRaw === 'false' ? 'light' : 'dark';
}

function applyDom(isDark: boolean)
{
    // The theme class lives on <html> so the document canvas (html background)
    // reads the dark token too — body alone leaves html on the light :root value,
    // which flashes through on short pages / overscroll. Body kept in sync for any
    // code that still reads body.className.
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    document.body.setAttribute('class', isDark ? 'dark' : 'light');
    // Ultra removed — clear any stale OLED marker a previous build may have set.
    root.removeAttribute('data-theme');
    const msg = document.getElementById('message');
    if (msg)
    {
        msg.className = isDark ? 'dark' : 'light';
    }
}

// Applied at module load so the document is themed before React mounts.
const initialMode = readInitialMode();
applyDom(initialMode === 'dark');

export function pauseAnimationsUntilLeave(elementId: string): void
{
    document.documentElement.setAttribute('data-theme-animations', 'off');
    const el = document.getElementById(elementId);
    if (!el)
    {
        return;
    }
    const restore = () =>
    {
        document.documentElement.removeAttribute('data-theme-animations');
        el.removeEventListener('mouseleave', restore);
        el.removeEventListener('touchend', restore);
    };
    el.addEventListener('mouseleave', restore);
    el.addEventListener('touchend', restore);
}

interface ThemeContextValue {
  /** The selected mode: light | dark. */
  mode: ThemeMode;
  /** Set the mode explicitly (persisted). */
  setMode: (mode: ThemeMode) => void;
  /** Toggle light ↔ dark. */
  cycleMode: () => void;
  /** Toggle light ↔ dark (alias of cycleMode, kept for existing callers). */
  toggleTheme: () => void;
  /** Effective dark state. */
  isDark: boolean;
  /** @deprecated Ultra/OLED mode was removed; always false. Kept so existing
   *  callers (page `is-ultra` class helpers) compile until they're redesigned. */
  isUltra: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode })
{
    const [mode, setModeState] = useState<ThemeMode>(initialMode);
    const isDark = mode === 'dark';

    useEffect(() =>
    {
        applyDom(isDark);
        localStorage.setItem(STORAGE_MODE, mode);
    }, [mode, isDark]);

    const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
    const toggleTheme = useCallback(() => setModeState((m) => (m === 'light' ? 'dark' : 'light')), []);

    const value = useMemo<ThemeContextValue>(
        () => ({
            mode,
            setMode,
            cycleMode: toggleTheme,
            toggleTheme,
            isDark,
            isUltra: false
        }),
        [mode, setMode, toggleTheme, isDark]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue
{
    const ctx = useContext(ThemeContext);
    if (!ctx)
    {
        throw new Error('useTheme must be used inside <ThemeProvider>');
    }
    return ctx;
}
