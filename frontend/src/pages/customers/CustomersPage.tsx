import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Spin, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { useMe } from '@/hooks/useMe';
import PageShell from '@/layouts/PageShell';

interface CustomerRow {
  email: string;
  enable: boolean;
  totalGB: number;
  expiryTime: number;
  ownerId: number;
  ownerName?: string;
  traffic?: { up: number; down: number };
}

const GB = 1024 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (!n) return '0';
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  return `${n} B`;
}

// CustomersPage is the role-scoped customer roster. Access is gated by the
// `customer.view` permission (PanelLayout + AppSidebar) and re-enforced on the
// backend, which also scopes the rows: admins/moderators see every customer,
// a reseller sees only the clients they own. Read-only — client management
// lives on the Clients page. The owner column is shown only to roles that see
// all customers (admin/moderator), so they can tell which reseller owns each.
export default function CustomersPage() {
  const { t } = useTranslation();
  const { me } = useMe();
  const seesAll = !!(me?.isAdmin || me?.isModerator);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', 'list'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/customers/list/paged?pageSize=200', undefined, { silent: true });
      const obj = msg.obj as { items?: CustomerRow[] } | null;
      return obj?.items ?? [];
    },
  });

  const list = customers ?? [];
  const activeCount = useMemo(() => list.filter((c) => c.enable).length, [list]);

  const columns: ColumnsType<CustomerRow> = [
    { title: t('pages.customers.customer'), dataIndex: 'email' },
    ...(seesAll
      ? [{
          title: t('pages.customers.owner'),
          key: 'owner',
          render: (_: unknown, c: CustomerRow) => c.ownerName || (c.ownerId ? `#${c.ownerId}` : '—'),
        }]
      : []),
    {
      title: t('pages.customers.statusCol'),
      dataIndex: 'enable',
      render: (on: boolean) => (
        <Tag color={on ? 'green' : 'red'}>{on ? t('pages.customers.active') : t('pages.customers.disabled')}</Tag>
      ),
    },
    {
      title: t('pages.customers.traffic'),
      key: 'traffic',
      render: (_, c) => {
        const used = (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0);
        return `${fmtBytes(used)} / ${c.totalGB > 0 ? fmtBytes(c.totalGB) : '∞'}`;
      },
    },
    {
      title: t('pages.customers.expiry'),
      dataIndex: 'expiryTime',
      render: (v: number) => (v > 0 ? new Date(v).toLocaleDateString() : '∞'),
    },
  ];

  return (
    <PageShell name="customers-page">
      <Spin spinning={isLoading} delay={200} size="large">
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Card size="small" hoverable className="summary-card">
              <Row gutter={[16, 12]}>
                <Col xs={12}>
                  <Statistic title={t('pages.customers.total')} value={list.length} prefix={<TeamOutlined />} />
                </Col>
                <Col xs={12}>
                  <Statistic
                    title={t('pages.customers.active')}
                    value={activeCount}
                    prefix={<CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card size="small" hoverable title={t('menu.customers')}>
              {!list.length ? (
                <Empty description={t('pages.customers.empty')} />
              ) : (
                <Table
                  rowKey="email"
                  size="small"
                  columns={columns}
                  dataSource={list}
                  pagination={{ pageSize: 10, showSizeChanger: true, hideOnSinglePage: true }}
                />
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageShell>
  );
}
