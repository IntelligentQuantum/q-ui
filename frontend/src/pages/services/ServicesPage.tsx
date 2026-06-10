import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { CircleCheck, Server, QrCode, RefreshCw, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard, SearchInput } from '@/components/ui';

import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Alert,
    Badge,
    Button,
    Card,
    DropdownMenu,
    Input,
    Label,
    Modal,
    Select,
    Switch,
    Table,
    TableSkeleton,
    ErrorState
} from '@/components/ui';
import type { Column } from '@/components/ui';
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

function fmtBytes(n: number): string
{
    if (!n)
    {
        return '0';
    }
    if (n >= GB)
    {
        return `${ (n / GB).toFixed(1) } GB`;
    }
    if (n >= 1024 * 1024)
    {
        return `${ (n / 1024 / 1024).toFixed(0) } MB`;
    }
    return `${ n } B`;
}

function randomToken(len = 8): string
{
    return (crypto.randomUUID?.() ?? `${ Math.random() }`).replace(/-/g, '').slice(0, len);
}

// ServicesPage shows a member their purchased configs (Xray clients they own,
// provisioned by store purchases). Everything is owner-scoped on the backend.
// Editing/regenerating goes through POST /clients/:email/rotate (server rebuilds
// the protocol payload). Renew/change-plan goes through POST /orders/renew,
// which charges the chosen product and re-sizes the existing config.
export default function ServicesPage()
{
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { format } = useCurrency();
    const [qrClient, setQrClient] = useState<ClientRow | null>(null);
    const [editing, setEditing] = useState<ClientRow | null>(null);
    const [renewing, setRenewing] = useState<ClientRow | null>(null);
    const [renewProductId, setRenewProductId] = useState<number | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        control,
        setValue
    } = useForm<EditForm>({
        defaultValues: { email: '', enable: true, regenerate: false }
    });

    const { data: clients, isLoading, isError, refetch } = useQuery({
        queryKey: ['clients', 'mine'],
        queryFn: async () =>
        {
            // owner=self scopes to the caller's own configs for every role, so an
            // admin sees their own purchased services here (not the whole panel).
            const msg = await HttpUtil.get('/panel/api/clients/list/paged?pageSize=200&owner=self', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            const obj = msg.obj as { items?: ClientRow[] } | null;
            return obj?.items ?? [];
        }
    });

    const { data: products } = useQuery({
        queryKey: ['products', 'store'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/products', undefined, { silent: true });
            return (msg.obj as Product[] | null) ?? [];
        }
    });

    // Subscription settings (sub URIs) so the config modal can show the buyer's
    // subscription link/QR — same as the Clients page. /panel/setting/defaultSettings
    // exposes only these non-sensitive presentation values and is open to any
    // logged-in user, so members can read it.
    const { data: subSettings } = useQuery({
        queryKey: ['settings', 'defaults', 'sub'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.post('/panel/setting/defaultSettings', undefined, { silent: true });
            const d = (msg?.obj ?? {}) as Record<string, unknown>;
            return {
                enable: !!d.subEnable,
                subURI: (d.subURI as string) || '',
                subJsonURI: (d.subJsonURI as string) || '',
                subJsonEnable: !!d.subJsonEnable
            };
        },
        staleTime: Infinity
    });

    const list = clients ?? [];
    const activeCount = useMemo(() => list.filter((c) => c.enable).length, [list]);

    const [q, setQ] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>();
    const filtered = useMemo(() =>
    {
        const s = q.trim().toLowerCase();
        return list.filter((c) =>
        {
            if (statusFilter === 'active' && !c.enable)
            {
                return false;
            }
            if (statusFilter === 'disabled' && c.enable)
            {
                return false;
            }
            if (!s)
            {
                return true;
            }
            return c.email.toLowerCase().includes(s);
        });
    }, [list, q, statusFilter]);

    const invalidate = () =>
    {
        qc.invalidateQueries({ queryKey: ['clients'] });
        qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
        qc.invalidateQueries({ queryKey: ['orders'] });
    };

    const openEdit = (c: ClientRow) =>
    {
        setEditing(c);
        reset({ email: c.email, enable: c.enable, regenerate: false });
    };

    const submitEdit = handleSubmit(async (values) =>
    {
        if (!editing)
        {
            return;
        }
        setBusy(true);
        try
        {
            const res = await HttpUtil.post(
                `/panel/api/clients/${ encodeURIComponent(editing.email) }/rotate`,
                { email: values.email.trim(), enable: values.enable, regenerate: values.regenerate },
                { ...JSON_HEADERS, silent: true }
            );
            if (res.success)
            {
                getMessage().success(t('pages.services.saved'));
                setEditing(null);
                invalidate();
            }
            else
            {
                getMessage().error(res.msg || t('somethingWentWrong'));
            }
        }
        finally
        {
            setBusy(false);
        }
    });

    const openRenew = (c: ClientRow) =>
    {
        setRenewing(c);
        setRenewProductId(undefined);
    };

    const submitRenew = async () =>
    {
        if (!renewing || !renewProductId)
        {
            return;
        }
        setBusy(true);
        try
        {
            const res = await HttpUtil.post(
                '/panel/api/orders/renew',
                { productId: renewProductId, email: renewing.email },
                { ...JSON_HEADERS, silent: true }
            );
            if (res.success)
            {
                getMessage().success(t('pages.services.renewed'));
                // Surface the updated connection details right away (reusing the
                // existing config/QR modal) — no need to hunt for them afterward.
                const renewed = renewing;
                setRenewing(null);
                invalidate();
                setQrClient(renewed);
            }
            else
            {
                getMessage().error(res.msg || t('somethingWentWrong'));
            }
        }
        finally
        {
            setBusy(false);
        }
    };

    const columns: Column<ClientRow>[] = [
        { key: 'email', header: t('pages.services.config'), accessor: (c) => c.email },
        {
            key: 'enable',
            header: t('pages.services.statusCol'),
            cell: (c) => (
        <Badge variant={c.enable ? 'success' : 'danger'}>
          {c.enable ? t('pages.services.active') : t('pages.services.disabled')}
        </Badge>
            )
        },
        {
            key: 'traffic',
            header: t('pages.services.traffic'),
            cell: (c) =>
            {
                const used = (c.traffic?.up ?? 0) + (c.traffic?.down ?? 0);
                return `${ fmtBytes(used) } / ${ c.totalGB > 0 ? fmtBytes(c.totalGB) : '∞' }`;
            }
        },
        {
            key: 'expiry',
            header: t('pages.services.expiry'),
            hideBelow: 'sm',
            cell: (c) => (c.expiryTime > 0 ? new Date(c.expiryTime).toLocaleDateString() : '∞')
        },
        {
            key: 'actions',
            header: '',
            align: 'end',
            width: 64,
            cell: (c) => (
        <DropdownMenu
          align="end"
          items={[
              {
                  key: 'config',
                  label: t('pages.services.showConfig'),
                  icon: <QrCode className="h-4 w-4" aria-hidden />,
                  onSelect: () => setQrClient(c)
              },
              {
                  key: 'renew',
                  label: t('pages.services.renew'),
                  icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                  onSelect: () => openRenew(c)
              },
              {
                  key: 'edit',
                  label: t('edit'),
                  icon: <Pencil className="h-4 w-4" aria-hidden />,
                  onSelect: () => openEdit(c)
              }
          ]}
        />
            )
        }
    ];

    const renewProduct = products?.find((p) => p.id === renewProductId);

    return (
    <PageShell name="services-page">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Server className="h-5 w-5" aria-hidden />} label={t('pages.services.totalConfigs')} value={list.length} />
          <StatCard icon={<CircleCheck className="h-5 w-5 text-success" aria-hidden />} label={t('pages.services.active')} value={activeCount} />
        </div>

        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            {list.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="min-w-[130px]"
                  placeholder={t('pages.services.statusCol')}
                  value={statusFilter ?? ''}
                  onChange={(v) => setStatusFilter(v || undefined)}
                  options={[
                      { value: '', label: t('all') },
                      { value: 'active', label: t('pages.services.active') },
                      { value: 'disabled', label: t('pages.services.disabled') }
                  ]}
                />
                <SearchInput
                  className="w-full sm:w-52"
                  aria-label={t('search')}
                  placeholder={t('search')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (
            <Table
              rowKey={(c) => c.email}
              columns={columns}
              data={filtered}
              empty={t('pages.services.empty')}
            />
          )}
        </Card>
      </div>

      {/* Same QR + per-link details modal as the Clients page. */}
      <ClientQrModal
        open={!!qrClient}
        client={qrClient ? ({ email: qrClient.email, subId: qrClient.subId } as unknown as ClientRecord) : null}
        subSettings={subSettings}
        onOpenChange={(o) =>
        {
            if (!o)
            {
                setQrClient(null);
            }
        }}
      />

      {/* Edit / regenerate */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('pages.services.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={submitEdit} loading={busy}>
              {t('save')}
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={submitEdit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-email">{t('pages.services.config')}</Label>
            <Input id="svc-email" {...register('email', { required: true })} />
            <button
              type="button"
              className="self-start text-xs text-accent underline-offset-4 hover:underline"
              onClick={() => setValue('email', `svc-${ randomToken() }`)}
            >
              {t('pages.services.randomize')}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="svc-enable">{t('pages.services.enabled')}</Label>
            <Controller
              control={control}
              name="enable"
              render={({ field }) => (
                <Switch id="svc-enable" checked={field.value} onCheckedChange={field.onChange} aria-label={t('pages.services.enabled')} />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="svc-regen">{t('pages.services.regenerate')}</Label>
              <Controller
                control={control}
                name="regenerate"
                render={({ field }) => (
                  <Switch id="svc-regen" checked={field.value} onCheckedChange={field.onChange} aria-label={t('pages.services.regenerate')} />
                )}
              />
            </div>
            <span className="text-xs text-muted-foreground">{t('pages.services.regenerateHint')}</span>
          </div>

          <Alert variant="warning">{t('pages.services.regenerateWarn')}</Alert>
        </form>
      </Modal>

      {/* Renew / change plan */}
      <Modal
        open={!!renewing}
        onClose={() => setRenewing(null)}
        title={t('pages.services.renewTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewing(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={submitRenew} loading={busy} disabled={!renewProductId}>
              {t('pages.services.renew')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('pages.services.renewHint')}</p>
          <Select
            placeholder={t('pages.services.selectPlan')}
            value={renewProductId != null ? String(renewProductId) : ''}
            onChange={(v) => setRenewProductId(v ? Number(v) : undefined)}
            options={(products ?? []).map((p) => ({
                value: String(p.id),
                label: `${ p.name } — ${ format(p.price) }${ p.durationDays > 0 ? ` · ${ p.durationDays } ${ t('pages.store.days') }` : '' }`
            }))}
          />
          {renewProduct ? (
            <Alert variant="info">
              {t('pages.services.renewSummary', {
                  price: format(renewProduct.price),
                  gb: renewProduct.trafficLimit > 0 ? `${ Math.round(renewProduct.trafficLimit / GB) } GB` : '∞',
                  days: renewProduct.durationDays > 0 ? renewProduct.durationDays : '∞'
              })}
            </Alert>
          ) : null}
        </div>
      </Modal>
    </PageShell>
    );
}
