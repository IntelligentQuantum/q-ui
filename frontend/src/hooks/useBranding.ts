import { useEffect } from 'react';

import { useMe } from '@/hooks/useMe';
import { useTheme } from '@/hooks/useTheme';

// useBranding applies the active workspace's branding to the document shell:
//   - favicon: a Manager workspace can set its own (empty = leave the panel's).
//   - default theme: the workspace's light/dark default is applied per session.
//     It is NOT forced on every render, so a user's manual toggle still wins for
//     the rest of the session; on the next load the workspace default re-applies.
// The brand title and logo are rendered directly from useMe by the sidebar/topbar.
// For admin / tenant-0 users every field is empty, so nothing changes.
export function useBranding()
{
    const { me } = useMe();
    const { setMode } = useTheme();

    useEffect(() =>
    {
        const href = me?.brandFavicon?.trim();
        if (!href)
        {
            return;
        }
        let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
        if (!link)
        {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = href;
    }, [me?.brandFavicon]);

    useEffect(() =>
    {
        const theme = me?.brandTheme;
        // Only an explicit light/dark workspace default is applied; "system" or
        // empty leaves the user's own preference untouched. Keyed on tenantSlug so
        // it applies once per workspace session rather than fighting the toggle.
        if (theme === 'light' || theme === 'dark')
        {
            setMode(theme);
        }
    }, [me?.tenantSlug, me?.brandTheme, setMode]);
}
