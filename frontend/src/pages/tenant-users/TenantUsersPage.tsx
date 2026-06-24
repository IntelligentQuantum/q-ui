import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
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
    Select,
    Spinner,
    StatCard,
    Table,
    Tooltip,
    confirm
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface TenantUser {
  id: number;
  username: string;
  role: string;
  fullName: string;
  phone: string;
  email: string;
  balance: number;
  costPerGbOverride: number;
  allowedInbounds?: number[];
}

interface UserFormValues {
  username: string;
  password?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  role: string;
  costPerGbOverride?: number;
  allowedInbounds?: number[];
}

const ROLE_BADGE: Record<string, BadgeVariant> = { moderator: 'warning', reseller: 'neutral', member: 'success' };

function normalizeRole(role: string): string
{
    const r = (role || '').toLowerCase();
    return r === 'reseller' || r === 'member' || r === 'moderator' ? r : 'member';
}

async function fetchUsers(): Promise<TenantUser[]>
{
    const msg = await HttpUtil.get('/panel/api/tenant/users', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load users');
    }
    return (msg.obj as TenantUser[]) ?? [];
}

function Field({ label, htmlFor, error, children }: { label: ReactNode; htmlFor?: string; error?: string; children: ReactNode })
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
    );
}

export default function TenantUsersPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { me } = useMe();
    const { format: formatMoney, unit } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const query = useQuery({ queryKey: ['tenant', 'users'], queryFn: fetchUsers });
    const users = useMemo(() => query.data ?? [], [query.data]);
    const fetched = query.data !== undefined || query.isError;
    const fetchError = query.error ? (query.error as Error).message : '';
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tenant', 'users'] });

    const stats = useMemo(() =>
    {
        let resellers = 0;
        for (const u of users)
        {
            if (normalizeRole(u.role) === 'reseller')
            {
                resellers += 1;
            }
        }
        return { total: users.length, resellers };
    }, [users]);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<TenantUser | null>(null);
    const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<UserFormValues>({
        defaultValues: { username: '', role: 'member' }
    });
    const watchRole = watch('role');
    const watchPerGb = Number(watch('costPerGbOverride')) || 0;

    // Inbound picker for moderators: the options are this workspace's inbounds
    // (the /options endpoint is already filtered to what the manager may use), so a
    // manager can only grant a moderator inbounds the manager themselves can see.
    const inboundsQuery = useQuery({
        queryKey: ['inbounds', 'options'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/inbounds/options', undefined, { silent: true });
            return (msg?.obj as { id: number; remark: string; protocol: string; port: number }[] | null) ?? [];
        }
    });
    const inboundOptions = useMemo(
        () => (inboundsQuery.data ?? []).map((i) => ({ value: String(i.id), label: `${ i.remark } (${ i.protocol }@${ i.port })` })),
        [inboundsQuery.data]
    );

    const saveMut = useMutation({
        mutationFn: (values: UserFormValues) =>
        {
            const url = editing ? `/panel/api/tenant/users/${ editing.id }` : '/panel/api/tenant/users';
            return HttpUtil.post(url, values, JSON_HEADERS);
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setModalOpen(false);
                messageApi.success(editing ? t('pages.users.toasts.userUpdated') : t('pages.users.toasts.userCreated'));
            }
        }
    });

    function openCreate()
    {
        setEditing(null);
        reset({ username: '', password: '', fullName: '', phone: '', email: '', role: 'member', costPerGbOverride: 0, allowedInbounds: [] });
        setModalOpen(true);
    }
    function openEdit(row: TenantUser)
    {
        setEditing(row);
        reset({ username: row.username, password: '', fullName: row.fullName, phone: row.phone, email: row.email, role: normalizeRole(row.role), costPerGbOverride: row.costPerGbOverride, allowedInbounds: row.allowedInbounds ?? [] });
        setModalOpen(true);
    }
    const submit = handleSubmit((values) => saveMut.mutateAsync(values));

    async function onDelete(row: TenantUser)
    {
        const ok = await confirm({
            title: t('pages.users.deleteConfirmTitle', { name: row.username }),
            description: t('pages.users.deleteConfirmContent'),
            confirmText: t('delete'), cancelText: t('cancel'), danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/tenant/users/${ row.id }/del`);
        if (msg?.success)
        {
            invalidate();
        }
    }

    // ---- balance ----
    const [balanceTarget, setBalanceTarget] = useState<TenantUser | null>(null);
    const [balOp, setBalOp] = useState<'add' | 'deduct' | 'set'>('add');
    const [balAmount, setBalAmount] = useState('0');
    const balanceMut = useMutation({
        mutationFn: () => HttpUtil.post(`/panel/api/tenant/users/${ balanceTarget!.id }/balance`,
            { op: balOp, amount: Number(balAmount) || 0, description: '' }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setBalanceTarget(null);
                messageApi.success(t('pages.users.toasts.balanceUpdated'));
            }
        }
    });
    function openBalance(row: TenantUser)
    {
        setBalanceTarget(row);
        setBalOp('add');
        setBalAmount('0');
    }

    const roleOptions = [
        { value: 'reseller', label: t('pages.users.role_reseller') },
        { value: 'member', label: t('pages.users.role_member') },
        { value: 'moderator', label: t('pages.users.role_moderator') }
    ];

    const columns: Column<TenantUser>[] = [
        {
            key: 'actions',
            header: t('pages.users.actions'),
            width: 150,
            cell: (row) => (
        <div className="flex items-center gap-0.5">
          <Tooltip content={t('pages.users.editUser')}>
            <Button aria-label={t('pages.users.editUser')} variant="ghost" size="icon" onClick={() => openEdit(row)}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('pages.users.manageBalance')}>
            <Button aria-label={t('pages.users.manageBalance')} variant="ghost" size="icon" onClick={() => openBalance(row)}>
              <Wallet className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('delete')}>
            <Button aria-label={t('delete')} variant="ghost" size="icon" disabled={!!me && me.id === row.id} onClick={() => onDelete(row)} className="text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
            )
        },
        { key: 'username', header: t('username'), accessor: (row) => row.username, sortable: true, cell: (row) => <span className="font-medium">{row.username}</span> },
        {
            key: 'role',
            header: t('pages.users.role'),
            accessor: (row) => normalizeRole(row.role),
            cell: (row) =>
            {
                const r = normalizeRole(row.role);
                return <Badge variant={ROLE_BADGE[r] ?? 'neutral'}>{t(`pages.users.role_${ r }`)}</Badge>;
            }
        },
        { key: 'email', header: t('emailAddress'), accessor: (row) => row.email || '', cell: (row) => <span className="text-muted-foreground">{row.email || '—'}</span>, className: 'hidden md:table-cell' },
        { key: 'balance', header: t('balance'), accessor: (row) => row.balance, sortable: true, cell: (row) => <strong className="tabular-nums">{formatMoney(row.balance)}</strong> }
    ];

    return (
    <PageShell
      name="tenant-users-page"
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.users.addUser')}
        </Button>
      }
    >
      {!fetched ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : fetchError ? (
        <ErrorState message={fetchError} onRetry={() => query.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard title={t('pages.users.totalUsers')} value={String(stats.total)} icon={<Users className="h-5 w-5" aria-hidden />} />
            <StatCard title={t('pages.users.resellers')} value={String(stats.resellers)} icon={<Users className="h-5 w-5" aria-hidden />} />
          </div>
          <Card className="p-4 sm:p-5">
            <Table<TenantUser>
              columns={columns}
              data={users}
              rowKey={(row) => String(row.id)}
              loading={query.isFetching}
              pageSize={0}
              empty={
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Users className="h-8 w-8 opacity-50" aria-hidden />
                  <div>{t('noData')}</div>
                </div>
              }
            />
          </Card>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('pages.users.editUser') : t('pages.users.addUser')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button onClick={() => submit()} loading={saveMut.isPending}>{t('save')}</Button>
          </>
        }
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('username')} htmlFor="tu-username" error={errors.username?.message}>
            <Input id="tu-username" autoComplete="off" aria-invalid={!!errors.username}
              {...register('username', { required: t('pages.register.errors.username'), pattern: { value: /^[A-Za-z0-9_]{3,32}$/, message: t('pages.register.errors.username') } })} />
          </Field>
          <Field label={t('password')} htmlFor="tu-password" error={errors.password?.message}>
            <PasswordInput id="tu-password" autoComplete="new-password" aria-invalid={!!errors.password}
              {...register('password', editing ? {} : { required: t('pages.register.errors.password'), minLength: { value: 8, message: t('pages.register.errors.password') } })} />
          </Field>
          <Field label={t('fullName')} htmlFor="tu-fullName">
            <Input id="tu-fullName" autoComplete="off" {...register('fullName')} />
          </Field>
          <Field label={t('phoneNumber')} htmlFor="tu-phone">
            <Input id="tu-phone" autoComplete="off" {...register('phone')} />
          </Field>
          <Field label={t('emailAddress')} htmlFor="tu-email">
            <Input id="tu-email" autoComplete="off" {...register('email')} />
          </Field>
          <Field label={t('pages.users.role')} htmlFor="tu-role">
            <Controller control={control} name="role" rules={{ required: true }}
              render={({ field }) => <Select id="tu-role" value={field.value} onChange={field.onChange} options={roleOptions} />} />
          </Field>
          <Field
            label={watchRole === 'moderator' ? t('pages.users.pricePerGb') : t('pages.users.costPerGb')}
            htmlFor="tu-costPerGb"
          >
            <Input id="tu-costPerGb" type="number" min={0} placeholder={t('pages.users.costPerGbDefault')}
              {...register('costPerGbOverride', { valueAsNumber: true, min: 0 })} />
            <span className="text-xs text-muted-foreground">
              {watchRole === 'moderator' ? t('pages.users.costPerGbModeratorHint') : t('pages.users.costPerGbHint')}
            </span>
            {watchPerGb > 0 && (
              <span className="text-xs text-accent">
                {t('pages.users.costPerGbPreview', { amount: formatMoney(watchPerGb * 100) })}
              </span>
            )}
          </Field>
          {watchRole === 'moderator' && (
            <Field label={t('pages.tenantUsers.allowedInbounds')} htmlFor="tu-inbounds">
              <Controller
                control={control}
                name="allowedInbounds"
                render={({ field }) => (
                  <MultiSelect
                    value={(field.value ?? []).map(String)}
                    onChange={(vals) => field.onChange(vals.map(Number))}
                    options={inboundOptions}
                  />
                )}
              />
              <span className="text-xs text-muted-foreground">{t('pages.tenantUsers.allowedInboundsHint')}</span>
            </Field>
          )}
        </form>
      </Modal>

      {/* Balance adjustment */}
      <Modal
        open={!!balanceTarget}
        onClose={() => setBalanceTarget(null)}
        title={balanceTarget ? t('pages.users.balanceTitle', { name: balanceTarget.username }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBalanceTarget(null)}>{t('cancel')}</Button>
            <Button onClick={() => balanceMut.mutateAsync()} loading={balanceMut.isPending}>{t('confirm')}</Button>
          </>
        }
      >
        {balanceTarget && (
          <p className="mb-4 text-sm">{t('balance')}: <strong className="tabular-nums">{formatMoney(balanceTarget.balance)}</strong></p>
        )}
        <div className="flex flex-col gap-4">
          <Field label={t('pages.users.operation')}>
            <Select
              value={balOp}
              onChange={(v) => setBalOp(v as 'add' | 'deduct' | 'set')}
              options={[
                  { value: 'add', label: t('pages.users.opAdd') },
                  { value: 'deduct', label: t('pages.users.opDeduct') },
                  { value: 'set', label: t('pages.users.opSet') }
              ]}
            />
          </Field>
          <Field label={t('pages.users.amount')} htmlFor="tu-amount">
            <div className="flex items-stretch">
              <Input id="tu-amount" type="number" min={0} className="rounded-e-none" value={balAmount} onChange={(e) => setBalAmount(e.target.value)} />
              <span className="inline-flex shrink-0 items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">{unit}</span>
            </div>
          </Field>
        </div>
      </Modal>
    </PageShell>
    );
}
