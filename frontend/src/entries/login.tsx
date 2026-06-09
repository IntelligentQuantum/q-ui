import { createRoot } from 'react-dom/client';

import '@/styles/theme.css';

import { setupAxios } from '@/api/axios-init';
import { applyDocumentTitle } from '@/utils';
import { captureReferralFromUrl } from '@/utils/referral';
import { readyI18n } from '@/i18n/react';
import { ThemeProvider } from '@/hooks/useTheme';
import { QueryProvider } from '@/api/QueryProvider';
import { Toaster } from '@/components/ui';
import LoginPage from '@/pages/login/LoginPage';

setupAxios();
applyDocumentTitle();
// A ?ref= invite link may land on /login too — capture it (first-touch).
captureReferralFromUrl();

readyI18n().then(() =>
{
    const root = document.getElementById('app');
    if (root)
    {
        createRoot(root).render(
      <ThemeProvider>
        <Toaster />
        <QueryProvider>
          <LoginPage />
        </QueryProvider>
      </ThemeProvider>
        );
    }
});
