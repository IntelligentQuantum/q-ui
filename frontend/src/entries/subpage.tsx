import { createRoot } from 'react-dom/client';

import '@/styles/theme.css';

import { readyI18n } from '@/i18n/react';
import { ThemeProvider } from '@/hooks/useTheme';
import { QueryProvider } from '@/api/QueryProvider';
import { Toaster } from '@/components/ui';
import SubPage from '@/pages/sub/SubPage';

readyI18n().then(() =>
{
    const root = document.getElementById('app');
    if (root)
    {
        createRoot(root).render(
      <ThemeProvider>
        <Toaster />
        <QueryProvider>
          <SubPage />
        </QueryProvider>
      </ThemeProvider>
        );
    }
});
