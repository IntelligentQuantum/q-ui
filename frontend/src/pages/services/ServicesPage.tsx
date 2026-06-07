import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Form, Input, Modal, Row, Select, Space, Spin, Statistic, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, CloudServerOutlined, EditOutlined, QrcodeOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import ClientQrModal from '@/pages/clients/ClientQrModal';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import type { ClientRecord } from '@/hooks/useClients';

interface ClientRow {
  email: string;
  subId: string;
  enable: boolean;
  totalGB: number;
  expiryTime: number;
  traffic?: { up: number; down: number };
}

interface Product {
  id: number;
  name: string;
  price: number;
  durationDays: number;
  trafficLimit: number;
}

interface EditForm {
  email: string;
  enable: boolean;
  regenerate: boolean;
}

const GB = 1024 * 1024 * 1024;
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

function fmtBytes(n: number): string {
  if (!n) return '0';
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  return `${n} B`;
}

function randomToken(len = 8): string {
  return (crypto.randomUUID?.() ?? `${Math.random()}`).replace(/-/g, '').slice(0, len);
}

// ServicesPage shows a member their purchased configs (Xray clients they own,
// provisioned by store purchases). Everything is owner-scoped on the backend.
// Editing/regenerating goes through POST /clients/:email/rotate (server rebuilds
// the protocol payload). Renew/change-plan goes through POST /orders/renew,
// which charges the chosen product and re-sizes the existing config.
export default function ServicesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [form] = Form.useForm<EditForm>();
  const [qrClient, setQrClient] = useState<ClientRow | null>(null);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [renewing, setRenewing] = useState<ClientRow | null>(null);
  const [renewProductId, setRenewProductId] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', 'mine'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/clients/list/paged?pageSize=200', undefined, { silent: true });
      const obj = msg.obj as { items?: ClientRow[] } | null;
      return obj?.items ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'store'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
      return (msg.obj as Product[] | null) ?? [];
    },
  });

  const list = clients ?? [];
  const activeCount = useMemo(() => list.filter((c) => c.enable).length, [list]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const openEdit = (c: ClientRow) => {
    setEditing(c);
    form.setFieldsValue({ email: c.email, enable: c.enable, regenerate: false });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    setBusy(true);
    try {
      const res = await HttpUtil.post(
        `/panel/api/clients/${encodeURIComponent(editing.email)}/rotate`,
        { email: values.email.trim(), enable: values.enable, regenerate: values.regenerate },
        { ...JSON_HEADERS, silent: true },
      );
      if (res.success) {
        getMessage().success(t('pages.services.saved'));
        setEditing(null);
        invalidate();
      } else {
        getMessage().error(res.msg || t('somethingWentWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const openRenew = (c: ClientRow) => {
    setRenewing(c);
    setRenewProductId(undefined);
  };

  const submitRenew = async () => {
    if (!renewing || !renewProductId) return;
    setBusy(true);
    try {
      const res = await HttpUtil.post(
        '/panel/api/orders/renew',
        { productId: renewProductId, email: renewing.email },
        { ...JSON_HEADERS, silent: true },
      );
      if (res.success) {
        getMessage().success(t('pages.services.renewed'));
        setRenewing(null);
        invalidate();
      } else {
        getMessage().error(res.msg || t('somethingWentWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<ClientRow> = [
    { title: t('pages.services.config'), dataIndex: 'email' },
    {
      title: t('pages.services.statusCol'),
      dataIndex: 'enable',
      render: (on: boolean) => <Tag color={on ? 'green' : 'red'}>{on ? t('pages.services.active') : t('pages.services.disabled')}</Tag>,
    },
    {
      title: t('pages.services.traffic'),
      key: 'traffic',
      render: (_, c) => {
        const used = (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0);
        return `${fmtBytes(used)} / ${c.totalGB > 0 ? fmtBytes(c.totalGB) : '∞'}`;
      },
    },
    {
      title: t('pages.services.expiry'),
      dataIndex: 'expiryTime',
      render: (v: number) => (v > 0 ? new Date(v).toLocaleDateString() : '∞'),
    },
    {
      title: '',
      key: 'actions',
      width: 320,
      render: (_, c) => (
        <Space wrap>
          <Button size="small" icon={<QrcodeOutlined />} onClick={() => setQrClient(c)}>
            {t('pages.services.showConfig')}
          </Button>
          <Button size="small" icon={<SyncOutlined />} onClick={() => openRenew(c)}>
            {t('pages.services.renew')}
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(c)}>
            {t('edit')}
          </Button>
        </Space>
      ),
    },
  ];

  const renewProduct = products?.find((p) => p.id === renewProductId);

  return (
    <PageShell name="services-page">
      <Spin spinning={isLoading} delay={200} size="large">
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Card size="small" hoverable className="summary-card">
              <Row gutter={[16, 12]}>
                <Col xs={12}>
                  <Statistic title={t('pages.services.totalConfigs')} value={list.length} prefix={<CloudServerOutlined />} />
                </Col>
                <Col xs={12}>
                  <Statistic
                    title={t('pages.services.active')}
                    value={activeCount}
                    prefix={<CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card size="small" hoverable title={t('menu.services')}>
              {!list.length ? (
                <Empty description={t('pages.services.empty')} />
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

      {/* Same QR + per-link details modal as the Clients page. */}
      <ClientQrModal
        open={!!qrClient}
        client={qrClient ? ({ email: qrClient.email, subId: qrClient.subId } as unknown as ClientRecord) : null}
        onOpenChange={(o) => { if (!o) setQrClient(null); }}
      />

      {/* Edit / regenerate */}
      <Modal
        open={!!editing}
        title={t('pages.services.editTitle')}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label={t('pages.services.config')}
            rules={[{ required: true }]}
            extra={
              <Button size="small" type="link" style={{ paddingLeft: 0 }} onClick={() => form.setFieldValue('email', `svc-${randomToken()}`)}>
                {t('pages.services.randomize')}
              </Button>
            }
          >
            <Input />
          </Form.Item>
          <Form.Item name="enable" label={t('pages.services.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="regenerate" valuePropName="checked" extra={t('pages.services.regenerateHint')}>
            <Switch checkedChildren={<ReloadOutlined />} /> <span style={{ marginInlineStart: 8 }}>{t('pages.services.regenerate')}</span>
          </Form.Item>
          <Alert type="warning" showIcon message={t('pages.services.regenerateWarn')} />
        </Form>
      </Modal>

      {/* Renew / change plan */}
      <Modal
        open={!!renewing}
        title={t('pages.services.renewTitle')}
        onCancel={() => setRenewing(null)}
        onOk={submitRenew}
        okText={t('pages.services.renew')}
        okButtonProps={{ disabled: !renewProductId }}
        confirmLoading={busy}
        destroyOnClose
      >
        <p style={{ opacity: 0.75 }}>{t('pages.services.renewHint')}</p>
        <Select
          style={{ width: '100%' }}
          placeholder={t('pages.services.selectPlan')}
          value={renewProductId}
          onChange={setRenewProductId}
          options={(products ?? []).map((p) => ({
            value: p.id,
            label: `${p.name} — ${format(p.price)}${p.durationDays > 0 ? ` · ${p.durationDays} ${t('pages.store.days')}` : ''}`,
          }))}
        />
        {renewProduct ? (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message={t('pages.services.renewSummary', {
              price: format(renewProduct.price),
              gb: renewProduct.trafficLimit > 0 ? `${Math.round(renewProduct.trafficLimit / GB)} GB` : '∞',
              days: renewProduct.durationDays > 0 ? renewProduct.durationDays : '∞',
            })}
          />
        ) : null}
      </Modal>
    </PageShell>
  );
}
