import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Statistic, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreOutlined, CheckCircleOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';

// The panel's axios defaults to form-urlencoded; backend product/order handlers
// bind JSON, so these mutations must declare a JSON content-type (matches the
// JSON_HEADERS convention used across the app, e.g. UsersPage/BillingPage).
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface Product {
  id: number;
  name: string;
  trafficLimit: number;
  durationDays: number;
  price: number;
  inboundIds: number[];
  status: string;
}

interface InboundOption {
  id: number;
  remark: string;
  protocol: string;
  port: number;
}

type ProductForm = Omit<Product, 'id' | 'status'> & { status?: string };

// ProductsPage is the catalog manager for admin + moderator (gated by
// product.manage on the backend). Create/edit/delete/activate all hit
// /panel/api/products/*; the backend re-checks the permission on every call.
export default function ProductsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form] = Form.useForm<ProductForm>();
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'manage'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
      return (msg.obj as Product[] | null) ?? [];
    },
  });

  // Inbound options drive which inbound a purchased config is provisioned on.
  const { data: inbounds } = useQuery({
    queryKey: ['inbounds', 'options'],
    queryFn: async () => {
      const msg = await HttpUtil.get('/panel/api/inbounds/options', undefined, { silent: true });
      return (msg.obj as InboundOption[] | null) ?? [];
    },
  });
  const inboundLabel = (id: number) => {
    const ib = inbounds?.find((i) => i.id === id);
    if (!ib) return id ? `#${id}` : '—';
    return `${ib.remark || `#${ib.id}`} · ${ib.protocol}:${ib.port}`;
  };

  const list = products ?? [];
  const stats = useMemo(() => {
    const active = list.filter((p) => p.status === 'active').length;
    return { total: list.length, active, inactive: list.length - active };
  }, [list]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  const save = useMutation({
    mutationFn: async (values: ProductForm) => {
      const url = editing ? `/panel/api/products/${editing.id}` : '/panel/api/products';
      return HttpUtil.post(url, values, { ...JSON_HEADERS, silent: true });
    },
    onSuccess: (msg) => {
      if (msg.success) {
        getMessage().success(t('pages.products.saved'));
        setOpen(false);
        setEditing(null);
        form.resetFields();
        invalidate();
      } else {
        getMessage().error(msg.msg || t('somethingWentWrong'));
      }
    },
  });

  const remove = async (id: number) => {
    const msg = await HttpUtil.post(`/panel/api/products/${id}/del`, undefined, { silent: true });
    if (msg.success) {
      getMessage().success(t('pages.products.deleted'));
      invalidate();
    } else {
      getMessage().error(msg.msg || t('somethingWentWrong'));
    }
  };

  const toggle = async (p: Product) => {
    const msg = await HttpUtil.post(`/panel/api/products/${p.id}/status`, { active: p.status !== 'active' }, { ...JSON_HEADERS, silent: true });
    if (msg.success) {
      getMessage().success(t('pages.products.statusChanged'));
      invalidate();
    } else {
      getMessage().error(msg.msg || t('somethingWentWrong'));
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ price: 0, trafficLimit: 0, durationDays: 0, status: 'active' });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    form.setFieldsValue(p);
    setOpen(true);
  };

  const columns: ColumnsType<Product> = [
    { title: t('pages.products.name'), dataIndex: 'name' },
    { title: t('pages.products.price'), dataIndex: 'price' },
    { title: t('pages.products.durationDays'), dataIndex: 'durationDays' },
    {
      title: t('pages.products.inbound'),
      dataIndex: 'inboundIds',
      render: (ids: number[]) => (ids && ids.length ? ids.map(inboundLabel).join(', ') : '—'),
    },
    {
      title: t('pages.products.status'),
      dataIndex: 'status',
      render: (s: string, p) => <Switch checked={s === 'active'} onChange={() => toggle(p)} />,
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_, p) => (
        <Space>
          <Button size="small" onClick={() => openEdit(p)}>
            {t('edit')}
          </Button>
          <Popconfirm title={t('pages.products.confirmDelete')} onConfirm={() => remove(p.id)}>
            <Button size="small" danger>
              {t('delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageShell name="products-page">
      <Spin spinning={isLoading} delay={200} size="large">
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Card size="small" hoverable className="summary-card">
              <Row gutter={[16, 12]}>
                <Col xs={8}>
                  <Statistic title={t('pages.products.total')} value={stats.total} prefix={<AppstoreOutlined />} />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t('pages.products.activeCount')}
                    value={stats.active}
                    prefix={<CheckCircleOutlined style={{ color: 'var(--ant-color-success)' }} />}
                  />
                </Col>
                <Col xs={8}>
                  <Statistic
                    title={t('pages.products.inactiveCount')}
                    value={stats.inactive}
                    prefix={<StopOutlined style={{ color: 'var(--ant-color-error)' }} />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card
              size="small"
              hoverable
              title={
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t('pages.products.create')}
                </Button>
              }
            >
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

      <Modal
        open={open}
        title={editing ? t('pages.products.edit') : t('pages.products.create')}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label={t('pages.products.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="price" label={t('pages.products.price')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="trafficLimit" label={t('pages.products.trafficLimitBytes')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="durationDays" label={t('pages.products.durationDays')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="inboundIds" label={t('pages.products.inbound')} tooltip={t('pages.products.inboundHint')}>
            <Select
              mode="multiple"
              allowClear
              placeholder={t('pages.products.inboundNone')}
              options={(inbounds ?? []).map((i) => ({
                value: i.id,
                label: `${i.remark || `#${i.id}`} · ${i.protocol}:${i.port}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  );
}
