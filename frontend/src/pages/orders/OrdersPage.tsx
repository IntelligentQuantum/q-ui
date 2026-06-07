import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Spin, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';

interface Order {
  id: number;
  userId: number;
  productId: number;
  productName: string;
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

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/orders', undefined, { silent: true });
      return (msg.obj as Order[] | null) ?? [];
    },
  });

  const list = orders ?? [];
  const stats = useMemo(() => {
    const completed = list.filter((o) => o.status === 'completed' || o.status === 'paid');
    const spent = completed.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { total: list.length, completed: completed.length, spent };
  }, [list]);

  const columns: ColumnsType<Order> = [
    { title: '#', dataIndex: 'id', width: 80 },
    {
      title: t('pages.orders.product'),
      dataIndex: 'productName',
      render: (name: string, o) => name || `#${o.productId}`,
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
      <Spin spinning={isLoading} delay={200} size="large">
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
            <Card size="small" hoverable title={t('menu.orders')}>
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={list}
                pagination={{ pageSize: 10, showSizeChanger: true, hideOnSinglePage: true }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageShell>
  );
}
