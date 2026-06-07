import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Input, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, SearchOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';
import { TableSkeleton, ErrorState } from '@/components/ui';

interface Order {
  id: number;
  userId: number;
  productId: number;
  productName: string;
  clientEmail: string;
  amount: number;
  status: string;
  createdAt: number;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'gold',
  paid: 'blue',
  completed: 'green',
  cancelled: 'red',
};

// OrdersPage lists orders. The backend scopes the result: admin/moderator see
// every order (order.view_all); resellers/members see only their own
// (order.view_own + user_id filter). The SPA does not need to filter.
export default function OrdersPage() {
  const { t } = useTranslation();
  const { format, formatNumber, unit } = useCurrency();

  const { data: orders, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/orders', undefined, { silent: true });
      if (!msg?.success) throw new Error(msg?.msg || '');
      return (msg.obj as Order[] | null) ?? [];
    },
  });

  const list = orders ?? [];
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();

  // Stats reflect ALL orders (not the filtered view), so the cards stay stable
  // while searching/filtering.
  const stats = useMemo(() => {
    const completed = list.filter((o) => o.status === 'completed' || o.status === 'paid');
    const spent = completed.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { total: list.length, completed: completed.length, spent };
  }, [list]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((o) => {
      if (status && o.status !== status) return false;
      if (!s) return true;
      return (o.productName || '').toLowerCase().includes(s) || String(o.id).includes(s);
    });
  }, [list, q, status]);

  const columns: ColumnsType<Order> = [
    { title: '#', dataIndex: 'id', width: 80 },
    {
      title: t('pages.orders.product'),
      dataIndex: 'productName',
      render: (name: string, o) => name || `#${o.productId}`,
    },
    {
      title: t('pages.orders.config'),
      dataIndex: 'clientEmail',
      render: (email: string) => email || '—',
    },
    { title: t('pages.orders.amount'), dataIndex: 'amount', render: (v: number) => format(v) },
    {
      title: t('pages.orders.status'),
      dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
    },
    {
      title: t('pages.orders.date'),
      dataIndex: 'createdAt',
      render: (v: number) => (v ? new Date(v).toLocaleString() : '-'),
    },
  ];

  return (
    <PageShell name="orders-page">
      <>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Card size="small" hoverable className="summary-card">
              <Row gutter={[16, 12]}>
                <Col xs={8}>
                  <Statistic title={t('pages.orders.total')} value={stats.total} prefix={<ShoppingCartOutlined />} />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t('pages.orders.completed')}
                    value={stats.completed}
                    prefix={<CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />}
                  />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t('pages.orders.spent')}
                    value={formatNumber(stats.spent)}
                    prefix={<WalletOutlined />}
                    suffix={unit}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card
              size="small"
              hoverable
              title={t('menu.orders')}
              extra={
                <Space wrap>
                  <Select
                    allowClear
                    size="small"
                    style={{ minWidth: 130 }}
                    placeholder={t('pages.orders.status')}
                    value={status}
                    onChange={setStatus}
                    options={Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s }))}
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
              }
            >
              {isLoading ? (
                <TableSkeleton rows={6} />
              ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
              ) : (
                <Table
                  rowKey="id"
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
