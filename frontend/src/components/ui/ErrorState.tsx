import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';

interface ErrorStateProps {
  /** Optional detail message (e.g. the server error text). */
  message?: string;
  /** When provided, renders a Retry button that calls it. */
  onRetry?: () => void;
}

// ErrorState is the shared "the data failed to load" view for data panels —
// a calm warning with the reason and a retry action, instead of a blank table.
export default function ErrorState({ message, onRetry }: ErrorStateProps)
{
    const { t } = useTranslation();
    return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-warning-subtle text-warning">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground">{t('somethingWentWrong')}</h3>
      {message ? (
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      ) : null}
      {onRetry ? (
        <Button onClick={onRetry} className="mt-1">
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t('retry')}
        </Button>
      ) : null}
    </div>
    );
}
