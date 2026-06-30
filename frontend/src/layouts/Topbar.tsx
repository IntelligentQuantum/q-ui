import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Menu as MenuIcon, Moon, Sun } from 'lucide-react';

import { BrandManager, LanguageManager } from '@/utils';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import { useMe } from '@/hooks/useMe';
import { cn, DropdownMenu } from '@/components/ui';
import type { DropdownItem } from '@/components/ui';
import NotificationBell from '@/components/NotificationBell';

interface TopbarProps {
  /** Opens the mobile navigation drawer (owned by PageShell). */
  onMenuClick: () => void;
}

const ICON_BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Topbar is the sticky application navbar shown above every panel page. It holds
 * the global controls — notifications, language and theme — on the end side, plus
 * the mobile hamburger + brand on the start side (the desktop sidebar shows the
 * brand on md+). Token-only, RTL-safe, mobile-first.
 */
export default function Topbar({ onMenuClick }: TopbarProps)
{
    const { t } = useTranslation();
    const { mode, cycleMode } = useTheme();
    const { me } = useMe();
    // The persisted cache (or the local one if /me is still loading) is the
    // single source of truth for what the user sees in the brand slot. The
    // cache already picks LTR vs RTL by the document direction.
    const brandTitle = BrandManager.getTitle();

    const [lang, setLang] = useState<string>(() => LanguageManager.getLanguage());
    const onLangChange = useCallback((next: string) =>
    {
        setLang(next);
        LanguageManager.setLanguage(next);
    }, []);

    const langItems = useMemo<DropdownItem[]>(
        () => (LanguageManager.supportedLanguages as { value: string; name: string; icon: string }[]).map((l) => ({
            key: l.value,
            label: (
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{l.icon}</span>
          <span>{l.name}</span>
          {l.value === lang ? <span className="ms-auto text-accent">•</span> : null}
        </span>
            ),
            onSelect: () => onLangChange(l.value)
        })),
        [lang, onLangChange]
    );

    const onCycleTheme = useCallback(() =>
    {
        pauseAnimationsUntilLeave('theme-cycle');
        cycleMode();
    }, [cycleMode]);

    const themeLabel = `${ t('menu.theme') }: ${ mode }`;

    return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      {/* Start: mobile hamburger + brand (desktop shows brand in the sidebar). */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className={cn(ICON_BTN, 'md:hidden')}
          aria-label={t('menu.dashboard')}
          onClick={onMenuClick}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span className="select-none truncate text-base font-semibold tracking-wide text-foreground md:hidden">
          {brandTitle}
        </span>
      </div>

      {/* End: global controls. */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        <NotificationBell />
        <DropdownMenu
          align="end"
          label={t('pages.settings.language')}
          items={langItems}
          trigger={<Languages className="h-[18px] w-[18px]" aria-hidden />}
        />
        <button
          id="theme-cycle"
          type="button"
          className={ICON_BTN}
          aria-label={themeLabel}
          title={themeLabel}
          onClick={onCycleTheme}
        >
          {mode === 'dark' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </header>
    );
}
