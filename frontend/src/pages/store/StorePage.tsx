import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Modal, Row, Spin, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { ME_QUERY_KEY, useMe } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import PageShell from '@/layouts/PageShell';

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
  const [modal, modalCtx] = Modal.useModal();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'store'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
      return (msg.obj as Product[] | null) ?? [];
    },
  });

  const doBuy = async (p: Product) => {
    const msg = await HttpUtil.post('/panel/api/orders', { productId: p.id }, { ...JSON_HEADERS, silent: true });
    if (msg.success) {
      getMessage().success(t('pages.store.purchased'));
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    } else {
      getMessage().error(msg.msg || t('somethingWentWrong'));
    }
  };

  // Confirm before spending balance — shows what they're buying, the price, and
  // the balance left afterwards, so a purchase is never a single misclick.
  const confirmBuy = (p: Product) => {
    modal.confirm({
      title: t('pages.store.confirmTitle'),
      okText: t('pages.store.buy'),
      cancelText: t('cancel'),
      content: (
        <div>
          <p style={{ marginBottom: 4 }}>
            <strong>{p.name}</strong>
          </p>
          <p style={{ marginBottom: 4 }}>
            {t('pages.store.price')}: <strong>{format(p.price)}</strong>
          </p>
          <p style={{ marginBottom: 0, opacity: 0.75 }}>
            {t('pages.store.balanceAfter')}: {format(Math.max(0, balance - p.price))}
          </p>
        </div>
      ),
      onOk: () => doBuy(p),
    });
  };

  const list = products ?? [];

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
          onClick={() => confirmBuy(p)}
        >
          {t('pages.store.buy')}
        </Button>
      ),
    },
  ];

  return (
    <PageShell name="store-page">
      {modalCtx}
      <Spin spinning={isLoading} delay={200} size="large">
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
            <Card size="small" hoverable title={t('menu.store')}>
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
