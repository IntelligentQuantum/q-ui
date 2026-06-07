import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Modal, Row, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreOutlined, SearchOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { ME_QUERY_KEY, useMe } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';
import { TableSkeleton, ErrorState } from '@/components/ui';

interface Product {
  id: number;
  name: string;
  trafficLimit: number;
  durationDays: number;
  price: number;
  status: string;
}

const GB = 1024 * 1024 * 1024;
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

// StorePage lets resellers and members browse the active catalog and purchase a
// product with their wallet balance. Buying calls POST /panel/api/orders; the
// backend debits the balance (writing a Transaction) and creates the order
// atomically. All gating is enforced server-side — this is presentation only.
export default function StorePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { balance } = useMe();
  const { format, formatNumber, unit } = useCurrency();
  const [buying, setBuying] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: products, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'store'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
      if (!msg?.success) throw new Error(msg?.msg || '');
      return (msg.obj as Product[] | null) ?? [];
    },
  });

  // Open the buy dialog where the buyer can name the config (the config name is
  // the client "email", as on the Clients page).
  const openBuy = (p: Product) => {
    setBuying(p);
    setName('');
  };

  const doBuy = async () => {
    if (!buying) return;
    setBusy(true);
    try {
      const msg = await HttpUtil.post(
        '/panel/api/orders',
        { productId: buying.id, name: name.trim() },
        { ...JSON_HEADERS, silent: true },
      );
      if (msg.success) {
        getMessage().success(t('pages.store.purchased'));
        setBuying(null);
        qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['clients'] });
      } else {
        getMessage().error(msg.msg || t('somethingWentWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const list = products ?? [];
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((p) => p.name.toLowerCase().includes(s)) : list;
  }, [list, q]);

  const columns: ColumnsType<Product> = [
    { title: t('pages.store.product'), dataIndex: 'name' },
    {
      title: t('pages.store.traffic'),
      dataIndex: 'trafficLimit',
      render: (v: number) => (v > 0 ? `${Math.round(v / GB)} GB` : '∞'),
    },
    {
      title: t('pages.store.duration'),
      dataIndex: 'durationDays',
      render: (v: number) => (v > 0 ? `${v} ${t('pages.store.days')}` : '∞'),
    },
    {
      title: t('pages.store.price'),
      dataIndex: 'price',
      render: (v: number) => format(v),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, p) => (
        <Button
          type="primary"
          size="small"
          icon={<ShoppingCartOutlined />}
          disabled={balance < p.price}
          onClick={() => openBuy(p)}
        >
          {t('pages.store.buy')}
        </Button>
      ),
    },
  ];

  return (
    <PageShell name="store-page">
      <Modal
        open={!!buying}
        title={t('pages.store.confirmTitle')}
        okText={t('pages.store.buy')}
        cancelText={t('cancel')}
        confirmLoading={busy}
        onCancel={() => setBuying(null)}
        onOk={doBuy}
        destroyOnClose
      >
        {buying && (
          <>
            <p style={{ marginBottom: 4 }}>
              <strong>{buying.name}</strong>
            </p>
            <p style={{ marginBottom: 4 }}>
              {t('pages.store.price')}: <strong>{format(buying.price)}</strong>
            </p>
            <p style={{ marginBottom: 12, opacity: 0.75 }}>
              {t('pages.store.balanceAfter')}: {format(Math.max(0, balance - buying.price))}
            </p>
            <div style={{ marginBottom: 4 }}>{t('pages.store.configName')}</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('pages.store.configNamePlaceholder')}
              maxLength={64}
            />
          </>
        )}
      </Modal>
      <>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Card size="small" hoverable className="summary-card">
              <Row gutter={[16, 12]}>
                <Col xs={12}>
                  <Statistic
                    title={t('pages.store.balance')}
                    value={formatNumber(balance)}
                    prefix={<WalletOutlined />}
                    suffix={unit}
                  />
                </Col>
                <Col xs={12}>
                  <Statistic title={t('pages.store.available')} value={list.length} prefix={<AppstoreOutlined />} />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card
              size="small"
              hoverable
              title={t('menu.store')}
              extra={
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
