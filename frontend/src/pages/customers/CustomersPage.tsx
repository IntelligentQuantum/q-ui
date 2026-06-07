import { Card, Empty } from 'antd';
import { useTranslation } from 'react-i18next';

import PageShell from '@/layouts/PageShell';

// CustomersPage is the moderator/reseller customer view. Access is gated by the
// `customer.view` permission (PanelLayout + AppSidebar) and re-enforced on the
// backend. The list endpoint is role-scoped (moderator: all customers;
// reseller: own customers) and is wired in a follow-up — this page is the
// navigable, permission-gated shell.
export default function CustomersPage() {
  const { t } = useTranslation();
  return (
    <PageShell name="customers-page">
      <Card size="small" hoverable title={t('menu.customers')}>
        <Empty description={t('pages.customers.pending')} />
      </Card>
    </PageShell>
  );
}
