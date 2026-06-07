import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Input, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { useMe } from '@/hooks/useMe';
import PageShell from '@/layouts/PageShell';
import { TableSkeleton, ErrorState } from '@/components/ui';

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

  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', 'list'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/customers/list/paged?pageSize=200', undefined, { silent: true });
      if (!msg?.success) throw new Error(msg?.msg || '');
      const obj = msg.obj as { items?: CustomerRow[] } | null;
      return obj?.items ?? [];
    },
  });

  const list = customers ?? [];
  const activeCount = useMemo(() => list.filter((c) => c.enable).length, [list]);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((c) => {
      if (statusFilter === 'active' && !c.enable) return false;
      if (statusFilter === 'disabled' && c.enable) return false;
      if (!s) return true;
      return c.email.toLowerCase().includes(s) || (c.ownerName || '').toLowerCase().includes(s);
    });
  }, [list, q, statusFilter]);

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
      <>
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
            <Card
              size="small"
              hoverable
              title={t('menu.customers')}
              extra={
                list.length ? (
                  <Space wrap>
                    <Select
                      allowClear
                      size="small"
                      style={{ minWidth: 130 }}
                      placeholder={t('pages.customers.statusCol')}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'active', label: t('pages.customers.active') },
                        { value: 'disabled', label: t('pages.customers.disabled') },
                      ]}
                    />
                    <Input
                      allowClear
                      size="small"
                      style={{ width: 200 }}
                      prefix={<SearchOutlined />}
                      aria-label={t('search')}
                      placeholder={t('search')}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </Space>
                ) : undefined
              }
            >
              {isLoading ? (
                <TableSkeleton rows={6} />
              ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
              ) : !list.length ? (
                <Empty description={t('pages.customers.empty')} />
              ) : (
                <Table
                  rowKey="email"
                  size="small"
                  columns={columns}
                  dataSource={filtered}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 10, showSizeChanger: true, hideOnSinglePage: true }}
                />
              )}
            </Card>
          </Col>
        </Row>
      </>
    </PageShell>
  );
}
