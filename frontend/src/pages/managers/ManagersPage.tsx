import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Eye, Gauge, Globe, KeyRound, LogIn, Network, Pause, Play, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import { setImpersonation } from '@/utils/impersonation';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Button,
    Card,
    ErrorState,
    Input,
    Label,
    Modal,
    MultiSelect,
    PasswordInput,
    Spinner,
    StatCard,
    Table,
    Tooltip,
    confirm
} from '@/components/ui';
import type { Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;
const GB = 1024 * 1024 * 1024;

interface Tenant {
  id: number;
  slug: string;
  managerUserId: number;
  name: string;
  status: string;
  domain: string;
  bandwidthQuotaBytes: number;
  bandwidthUsedBytes: number;
  createdAt: number;
}

interface ManagerRow {
  tenant: Tenant;
  manager: { id: number; username: string; email: string; balance: number } | null;
  userCount: number;
  // Workspace TREASURY balance (the capital the workspace sells from), distinct
  // from manager.balance (the manager's personal account balance).
  workspaceBalance: number;
}

interface WorkspaceOverview {
  tenant: Tenant;
  manager: { id: number; username: string; email: string } | null;
  userCount: number;
  productCount: number;
  orderCount: number;
  revenue: number;
  pendingDeposits: number;
  openTickets: number;
  managerBalance: number;
}

interface CreateValues {
  username: string;
  password: string;
  slug: string;
  name: string;
  email?: string;
  fullName?: string;
  phone?: string;
}

async function fetchManagers(): Promise<ManagerRow[]>
{
    const msg = await HttpUtil.get('/panel/api/admin/managers', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load managers');
    }
    return (msg.obj as ManagerRow[]) ?? [];
}

function Field({ label, htmlFor, error, hint, children }: {
  label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span>
          : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
    );
}

export default function ManagersPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { format: formatMoney } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const query = useQuery({ queryKey: ['admin', 'managers'], queryFn: fetchManagers });
    const rows = useMemo(() => query.data ?? [], [query.data]);
    const fetched = query.data !== undefined || query.isError;
    const fetchError = query.error ? (query.error as Error).message : '';

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'managers'] });

    const stats = useMemo(() =>
    {
        let active = 0;
        let users = 0;
        for (const r of rows)
        {
            if (r.tenant.status === 'active')
            {
                active += 1;
            }
            users += r.userCount;
        }
        return { total: rows.length, active, users };
    }, [rows]);

    // ---- create ----
    const [createOpen, setCreateOpen] = useState(false);
    const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateValues>({
        defaultValues: { username: '', password: '', slug: '', name: '' }
    });
    const [newKey, setNewKey] = useState<string | null>(null);

    const createMut = useMutation({
        mutationFn: (values: CreateValues) => HttpUtil.post('/panel/api/admin/managers', values, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setCreateOpen(false);
                const key = (msg.obj as { apiKey?: string } | null)?.apiKey;
                if (key)
                {
                    setNewKey(key);
                }
                messageApi.success(t('pages.managers.toasts.created'));
            }
        }
    });

    function openCreate()
    {
        reset({ username: '', password: '', slug: '', name: '', email: '', fullName: '', phone: '' });
        setCreateOpen(true);
    }
    const submitCreate = handleSubmit((values) => createMut.mutateAsync(values));

    // ---- bandwidth ----
    const [bwTarget, setBwTarget] = useState<ManagerRow | null>(null);
    const [bwGb, setBwGb] = useState('0');
    const bwMut = useMutation({
        mutationFn: (quotaBytes: number) =>
            HttpUtil.post(`/panel/api/admin/managers/${ bwTarget!.tenant.id }/bandwidth`, { quotaBytes }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setBwTarget(null);
                messageApi.success(t('pages.managers.toasts.bandwidthUpdated'));
            }
        }
    });
    function openBandwidth(row: ManagerRow)
    {
        setBwTarget(row);
        setBwGb(String(Math.round((row.tenant.bandwidthQuotaBytes / GB) * 100) / 100));
    }

    // ---- allowed inbounds (which inbounds this workspace may create clients on) ----
    const [inboundTarget, setInboundTarget] = useState<ManagerRow | null>(null);
    const [selectedInbounds, setSelectedInbounds] = useState<string[]>([]);
    const allInboundsQuery = useQuery({
        queryKey: ['inbounds', 'options'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/inbounds/options', undefined, { silent: true });
            return (msg?.obj as { id: number; remark: string; protocol: string; port: number }[] | null) ?? [];
        }
    });
    const inboundOpts = useMemo(
        () => (allInboundsQuery.data ?? []).map((i) => ({ value: String(i.id), label: `${ i.remark } (${ i.protocol }@${ i.port })` })),
        [allInboundsQuery.data]
    );
    const inboundMut = useMutation({
        mutationFn: () => HttpUtil.post(`/panel/api/admin/managers/${ inboundTarget!.tenant.id }/inbounds`, { allowedInbounds: selectedInbounds.map(Number) }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                setInboundTarget(null);
                messageApi.success(t('pages.managers.toasts.inboundsUpdated'));
            }
        }
    });
    async function openInbounds(row: ManagerRow)
    {
        const msg = await HttpUtil.get(`/panel/api/admin/managers/${ row.tenant.id }/inbounds`, undefined, { silent: true });
        const ids = (msg?.obj as { allowedInbounds?: number[] } | null)?.allowedInbounds ?? [];
        setSelectedInbounds(ids.map(String));
        setInboundTarget(row);
    }

    // ---- custom domain ----
    const [domainTarget, setDomainTarget] = useState<ManagerRow | null>(null);
    const [domainValue, setDomainValue] = useState('');
    const domainMut = useMutation({
        mutationFn: (domain: string) =>
            HttpUtil.post(`/panel/api/admin/managers/${ domainTarget!.tenant.id }/domain`, { domain }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setDomainTarget(null);
                messageApi.success(t('pages.managers.toasts.domainUpdated'));
            }
        }
    });
    function openDomain(row: ManagerRow)
    {
        setDomainTarget(row);
        setDomainValue(row.tenant.domain || '');
    }

    // ---- charge workspace balance (the manager's pool that funds sales) ----
    const [chargeTarget, setChargeTarget] = useState<ManagerRow | null>(null);
    const [chargeOp, setChargeOp] = useState<'add' | 'deduct' | 'set'>('add');
    const [chargeAmount, setChargeAmount] = useState('');
    const chargeMut = useMutation({
        mutationFn: () =>
            HttpUtil.post(
                `/panel/api/admin/managers/${ chargeTarget!.tenant.id }/balance`,
                { op: chargeOp, amount: Math.max(0, Math.round(Number(chargeAmount) || 0)) },
                JSON_HEADERS
            ),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setChargeTarget(null);
                messageApi.success(t('pages.managers.toasts.balanceUpdated'));
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });
    function openCharge(row: ManagerRow)
    {
        setChargeTarget(row);
        setChargeOp('add');
        setChargeAmount('');
    }

    // ---- workspace details (read-only overview, no impersonation) ----
    const [detailsId, setDetailsId] = useState<number | null>(null);
    const overviewQuery = useQuery({
        queryKey: ['admin', 'managers', 'overview', detailsId],
        enabled: detailsId !== null,
        queryFn: async () =>
        {
            const msg = await HttpUtil.get(`/panel/api/admin/managers/${ detailsId }/overview`, undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || '');
            }
            return msg.obj as WorkspaceOverview;
        }
    });

    // Enter the workspace as admin (view-as): scope data to this tenant and open
    // its panel. A full reload makes /me + the X-Tenant header apply cleanly.
    function openWorkspace(row: ManagerRow)
    {
        setImpersonation(row.tenant.id, row.tenant.slug);
        const base = window.Q_UI_BASE_PATH || '/';
        window.location.href = `${ base }panel/manager/${ row.tenant.slug }`;
    }

    async function toggleStatus(row: ManagerRow)
    {
        const next = row.tenant.status === 'active' ? 'suspended' : 'active';
        const msg = await HttpUtil.post(`/panel/api/admin/managers/${ row.tenant.id }/status`, { status: next }, JSON_HEADERS);
        if (msg?.success)
        {
            invalidate();
            messageApi.success(t('pages.managers.toasts.statusUpdated'));
        }
    }

    async function rotateKey(row: ManagerRow)
    {
        const ok = await confirm({
            title: t('pages.managers.rotateConfirmTitle', { name: row.tenant.slug }),
            description: t('pages.managers.rotateConfirmContent'),
            confirmText: t('confirm'),
            cancelText: t('cancel')
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/admin/managers/${ row.tenant.id }/rotate-key`);
        const key = (msg?.obj as { apiKey?: string } | null)?.apiKey;
        if (msg?.success && key)
        {
            setNewKey(key);
        }
    }

    async function onDelete(row: ManagerRow)
    {
        const ok = await confirm({
            title: t('pages.managers.deleteConfirmTitle', { name: row.tenant.slug }),
            description: t('pages.managers.deleteConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/admin/managers/${ row.tenant.id }/del`);
        if (msg?.success)
        {
            invalidate();
            messageApi.success(t('pages.managers.toasts.deleted'));
        }
    }

    const fmtBytes = (n: number) => (n <= 0 ? t('pages.managers.unlimited') : `${ Math.round((n / GB) * 100) / 100 } GB`);

    const columns: Column<ManagerRow>[] = [
        {
            key: 'actions',
            header: t('pages.users.actions'),
            width: 360,
            cell: (row) => (
        <div className="flex items-center gap-0.5">
          <Tooltip content={t('pages.managers.viewDetails')}>
            <Button variant="ghost" size="icon" onClick={() => setDetailsId(row.tenant.id)}>
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={row.tenant.status === 'active' ? t('pages.managers.suspend') : t('pages.managers.activate')}>
            <Button variant="ghost" size="icon" onClick={() => toggleStatus(row)}>
              {row.tenant.status === 'active' ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.openWorkspace')}>
            <Button variant="ghost" size="icon" onClick={() => openWorkspace(row)}>
              <LogIn className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.chargeBalance')}>
            <Button variant="ghost" size="icon" onClick={() => openCharge(row)}>
              <Wallet className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.allocateBandwidth')}>
            <Button variant="ghost" size="icon" onClick={() => openBandwidth(row)}>
              <Gauge className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.allowedInbounds')}>
            <Button variant="ghost" size="icon" onClick={() => openInbounds(row)}>
              <Network className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.setDomain')}>
            <Button variant="ghost" size="icon" onClick={() => openDomain(row)}>
              <Globe className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.managers.rotateKey')}>
            <Button variant="ghost" size="icon" onClick={() => rotateKey(row)}>
              <KeyRound className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('delete')}>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)} className="text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
            )
        },
        {
            key: 'slug',
            header: t('pages.managers.slug'),
            accessor: (row) => row.tenant.slug,
            sortable: true,
            cell: (row) => <span className="font-medium">/{row.tenant.slug}</span>
        },
        { key: 'name', header: t('pages.managers.name'), accessor: (row) => row.tenant.name },
        {
            key: 'manager',
            header: t('pages.managers.manager'),
            cell: (row) => <span className="text-muted-foreground">{row.manager?.username ?? '—'}</span>
        },
        {
            key: 'status',
            header: t('pages.managers.status'),
            accessor: (row) => row.tenant.status,
            cell: (row) => (
        <Badge variant={row.tenant.status === 'active' ? 'success' : 'neutral'}>
          {t(`pages.managers.status_${ row.tenant.status }`, { defaultValue: row.tenant.status })}
        </Badge>
            )
        },
        { key: 'users', header: t('pages.managers.users'), accessor: (row) => row.userCount, sortable: true, cell: (row) => <span className="tabular-nums">{row.userCount}</span> },
        {
            key: 'balance',
            header: t('pages.managers.workspaceBalance'),
            accessor: (row) => row.workspaceBalance ?? 0,
            sortable: true,
            cell: (row) => <span className="tabular-nums font-medium">{formatMoney(row.workspaceBalance ?? 0)}</span>
        },
        {
            key: 'bandwidth',
            header: t('pages.managers.bandwidth'),
            cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {fmtBytes(row.tenant.bandwidthUsedBytes)} / {fmtBytes(row.tenant.bandwidthQuotaBytes)}
        </span>
            ),
            className: 'hidden md:table-cell'
        }
    ];

    return (
    <PageShell
      name="managers-page"
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.managers.addManager')}
        </Button>
      }
    >
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
            ) : fetchError ? (
              <ErrorState message={fetchError} onRetry={() => query.refetch()} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                  <StatCard title={t('pages.managers.totalWorkspaces')} value={String(stats.total)} icon={<Building2 className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.managers.activeWorkspaces')} value={String(stats.active)} icon={<Play className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.managers.totalTenantUsers')} value={String(stats.users)} icon={<Users className="h-5 w-5" aria-hidden />} />
                </div>

                <Card className="p-4 sm:p-5">
                  <Table<ManagerRow>
                    columns={columns}
                    data={rows}
                    rowKey={(row) => String(row.tenant.id)}
                    loading={query.isFetching}
                    pageSize={0}
                    empty={
                      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                        <Building2 className="h-8 w-8 opacity-50" aria-hidden />
                        <div>{t('noData')}</div>
                      </div>
                    }
                  />
                </Card>
              </div>
            )}

        {/* Create workspace */}
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={t('pages.managers.addManager')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
              <Button onClick={() => submitCreate()} loading={createMut.isPending}>{t('save')}</Button>
            </>
          }
        >
          <form noValidate onSubmit={submitCreate} className="flex flex-col gap-4">
            <Field label={t('pages.managers.slug')} htmlFor="m-slug" error={errors.slug?.message} hint={t('pages.managers.slugHint')}>
              <Input id="m-slug" autoComplete="off" placeholder="apimehdi"
                aria-invalid={!!errors.slug}
                {...register('slug', {
                    required: t('pages.managers.toasts.slugInvalid'),
                    pattern: { value: /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, message: t('pages.managers.toasts.slugInvalid') }
                })} />
            </Field>
            <Field label={t('pages.managers.name')} htmlFor="m-name">
              <Input id="m-name" autoComplete="off" {...register('name')} />
            </Field>
            <Field label={t('username')} htmlFor="m-username" error={errors.username?.message}>
              <Input id="m-username" autoComplete="off"
                aria-invalid={!!errors.username}
                {...register('username', {
                    required: t('pages.register.errors.username'),
                    pattern: { value: /^[A-Za-z0-9_]{3,32}$/, message: t('pages.register.errors.username') }
                })} />
            </Field>
            <Field label={t('password')} htmlFor="m-password" error={errors.password?.message}>
              <PasswordInput id="m-password" autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register('password', {
                    required: t('pages.register.errors.password'),
                    minLength: { value: 8, message: t('pages.register.errors.password') }
                })} />
            </Field>
            <Field label={t('emailAddress')} htmlFor="m-email">
              <Input id="m-email" autoComplete="off" {...register('email')} />
            </Field>
          </form>
        </Modal>

        {/* Allocate bandwidth */}
        <Modal
          open={!!bwTarget}
          onClose={() => setBwTarget(null)}
          title={bwTarget ? t('pages.managers.bandwidthTitle', { name: bwTarget.tenant.slug }) : ''}
          footer={
            <>
              <Button variant="secondary" onClick={() => setBwTarget(null)}>{t('cancel')}</Button>
              <Button onClick={() => bwMut.mutateAsync(Math.max(0, Math.round(Number(bwGb) * GB)))} loading={bwMut.isPending}>{t('confirm')}</Button>
            </>
          }
        >
          <Field label={t('pages.managers.quotaGb')} htmlFor="m-bw" hint={t('pages.managers.quotaHint')}>
            <Input id="m-bw" type="number" min={0} value={bwGb} onChange={(e) => setBwGb(e.target.value)} />
          </Field>
        </Modal>

        {/* Allowed inbounds — which inbounds this workspace may create clients on */}
        <Modal
          open={!!inboundTarget}
          onClose={() => setInboundTarget(null)}
          title={inboundTarget ? t('pages.managers.inboundsTitle', { name: inboundTarget.tenant.slug }) : ''}
          footer={
            <>
              <Button variant="secondary" onClick={() => setInboundTarget(null)}>{t('cancel')}</Button>
              <Button onClick={() => inboundMut.mutateAsync()} loading={inboundMut.isPending}>{t('confirm')}</Button>
            </>
          }
        >
          <Field label={t('pages.managers.allowedInbounds')} htmlFor="m-inbounds" hint={t('pages.managers.allowedInboundsHint')}>
            <MultiSelect value={selectedInbounds} onChange={setSelectedInbounds} options={inboundOpts} />
          </Field>
        </Modal>

        {/* Custom domain */}
        <Modal
          open={!!domainTarget}
          onClose={() => setDomainTarget(null)}
          title={domainTarget ? t('pages.managers.domainTitle', { name: domainTarget.tenant.slug }) : ''}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDomainTarget(null)}>{t('cancel')}</Button>
              <Button onClick={() => domainMut.mutateAsync(domainValue.trim())} loading={domainMut.isPending}>{t('confirm')}</Button>
            </>
          }
        >
          <Field label={t('pages.managers.domain')} htmlFor="m-domain" hint={t('pages.managers.domainHint')}>
            <Input id="m-domain" value={domainValue} onChange={(e) => setDomainValue(e.target.value)} placeholder="panel.example.com" />
          </Field>
        </Modal>

        {/* Charge workspace balance — the manager's pool that funds every sale */}
        <Modal
          open={!!chargeTarget}
          onClose={() => setChargeTarget(null)}
          title={chargeTarget ? t('pages.managers.chargeTitle', { name: chargeTarget.tenant.slug }) : ''}
          footer={
            <>
              <Button variant="secondary" onClick={() => setChargeTarget(null)}>{t('cancel')}</Button>
              <Button onClick={() => chargeMut.mutateAsync()} loading={chargeMut.isPending}>{t('confirm')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {chargeTarget ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('pages.managers.currentBalance')}</span>
                <span className="font-semibold tabular-nums">{formatMoney(chargeTarget.workspaceBalance)}</span>
              </div>
            ) : null}
            <Field label={t('pages.users.operation')}>
              <div className="flex gap-2">
                {(['add', 'deduct', 'set'] as const).map((op) => (
                  <Button
                    key={op}
                    variant={chargeOp === op ? 'primary' : 'secondary'}
                    onClick={() => setChargeOp(op)}
                  >
                    {t(`pages.users.op${ op.charAt(0).toUpperCase() }${ op.slice(1) }`)}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label={t('pages.users.amount')}>
              <Input
                type="number"
                min={0}
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </Modal>

        {/* Workspace details — read-only overview (no impersonation) */}
        <Modal
          open={detailsId !== null}
          onClose={() => setDetailsId(null)}
          title={overviewQuery.data ? t('pages.managers.detailsTitle', { name: overviewQuery.data.tenant.slug }) : t('pages.managers.viewDetails')}
          footer={<Button onClick={() => setDetailsId(null)}>{t('confirm')}</Button>}
        >
          {overviewQuery.isLoading ? (
            <div className="flex min-h-[20vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>
          ) : overviewQuery.isError || !overviewQuery.data ? (
            <ErrorState message={overviewQuery.error ? (overviewQuery.error as Error).message : t('fail')} onRetry={() => overviewQuery.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard title={t('pages.managers.customers')} value={String(overviewQuery.data.userCount)} icon={<Users className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('menu.products')} value={String(overviewQuery.data.productCount)} icon={<Building2 className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('menu.orders')} value={String(overviewQuery.data.orderCount)} icon={<Building2 className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('pages.managers.revenue')} value={formatMoney(overviewQuery.data.revenue)} icon={<Gauge className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('pages.managers.managerBalance')} value={formatMoney(overviewQuery.data.managerBalance)} icon={<Gauge className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('pages.managers.pendingDeposits')} value={String(overviewQuery.data.pendingDeposits)} icon={<KeyRound className="h-5 w-5" aria-hidden />} />
              <StatCard title={t('pages.managers.openTickets')} value={String(overviewQuery.data.openTickets)} icon={<KeyRound className="h-5 w-5" aria-hidden />} />
              <StatCard
                title={t('pages.managers.bandwidth')}
                value={`${ fmtBytes(overviewQuery.data.tenant.bandwidthUsedBytes) } / ${ fmtBytes(overviewQuery.data.tenant.bandwidthQuotaBytes) }`}
                icon={<Gauge className="h-5 w-5" aria-hidden />}
              />
            </div>
          )}
        </Modal>

        {/* One-time API key reveal */}
        <Modal
          open={!!newKey}
          onClose={() => setNewKey(null)}
          title={t('pages.managers.apiKeyTitle')}
          footer={<Button onClick={() => setNewKey(null)}>{t('confirm')}</Button>}
        >
          <p className="mb-3 text-sm text-muted-foreground">{t('pages.managers.apiKeyHint')}</p>
          <code className="block break-all rounded-md border border-border bg-surface-sunken p-3 text-sm">{newKey}</code>
        </Modal>
    </PageShell>
    );
}
