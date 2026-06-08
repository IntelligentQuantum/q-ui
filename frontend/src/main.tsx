import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import '@/styles/theme.css';

import { setupAxios } from '@/api/axios-init';
import { readyI18n } from '@/i18n/react';
import { ThemeProvider } from '@/hooks/useTheme';
import { QueryProvider } from '@/api/QueryProvider';
import { Toaster } from '@/components/ui';
import { router } from '@/routes';

setupAxios();

readyI18n().then(() =>
{
    const root = document.getElementById('app');
    if (root)
    {
        createRoot(root).render(
      <ThemeProvider>
        <Toaster />
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </ThemeProvider>
        );
    }
});
