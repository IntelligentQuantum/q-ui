import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  /** Optional detail message (e.g. the server error text). */
  message?: string;
  /** When provided, renders a Retry button that calls it. */
  onRetry?: () => void;
}

// ErrorState is the shared "the data failed to load" view for data panels —
// a calm warning with the reason and a retry action, instead of a blank table.
export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <Result
      status="warning"
      title={t('somethingWentWrong')}
      subTitle={message || undefined}
      extra={
        onRetry ? (
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
            {t('retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
