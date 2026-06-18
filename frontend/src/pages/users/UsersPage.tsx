import { useEffect, useMemo, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard, SearchInput } from '@/components/ui';
import { message } from '@/components/ui/message';
import {
    Crown,
    History,
    Pencil,
    Plus,
    Trash2,
    Users,
    User,
    Wallet
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe, ME_QUERY_KEY } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil, IntlUtil } from '@/utils';
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
    PasswordInput,
    Select,
    Spinner,
    Table,
    Tabs,
    Tooltip,
    cn,
    confirm
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface PanelUser {
  id: number;
  username: string;
  role: string;
  fullName: string;
  phone: string;
  email: string;
  balance: number;
  costPerGbOverride: number;
}

interface Transaction {
  id: number;
  userId: number;
  amount: number;
  type: string;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: number;
}

interface UserFormValues {
  username: string;
  password?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  role: string;
  balance?: number;
  costPerGbOverride?: number;
}

type BalanceOp = 'add' | 'deduct' | 'set';

interface BalanceFormValues {
  op: BalanceOp;
  amount: number;
  description: string;
}

const ROLE_BADGE: Record<string, BadgeVariant> = {
    admin: 'warning',
    manager: 'primary',
    reseller: 'neutral',
    member: 'success'
};

// Normalize casing + legacy "user" alias so the label/colour resolve no matter
// how the role was stored (e.g. "Admin", "ADMIN", "user").
function normalizeRole(role: string): string
{
    const raw = (role || '').toLowerCase();
    // Legacy "user" and the removed "moderator" role both fold to reseller.
    if (raw === 'user' || raw === 'moderator')
    {
        return 'reseller';
    }
    return raw || 'member';
}

async function fetchUsers(): Promise<PanelUser[]>
{
    const msg = await HttpUtil.get('/panel/api/admin/users', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load users');
    }
    return (msg.obj as PanelUser[]) ?? [];
}

async function fetchTransactions(userId: number): Promise<Transaction[]>
{
    const msg = await HttpUtil.get(`/panel/api/admin/transactions?userId=${ userId }`, undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load transactions');
    }
    return (msg.obj as Transaction[]) ?? [];
}

// One labelled form row: label, control, optional hint + validation error.
function Field({
    label,
    htmlFor,
    hint,
    error,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
    );
}

// A numeric input with a trailing unit addon, styled with design-system tokens
// (logical radii so it flips correctly in RTL).
function UnitInput({ unit, className, ...props }: { unit: ReactNode } & InputHTMLAttributes<HTMLInputElement>)
{
    return (
    <div className="flex items-stretch">
      <Input type="number" className={cn('rounded-e-none', className)} {...props} />
      <span className="inline-flex shrink-0 items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
    );
}

export default function UsersPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { me } = useMe();
    const { format: formatMoney, formatNumber, unit } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: fetchUsers });
    const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const filteredUsers = useMemo(() =>
    {
        const needle = search.trim().toLowerCase();
        return users.filter((u) =>
        {
            if (roleFilter !== 'all' && normalizeRole(u.role) !== roleFilter)
            {
                return false;
            }
            if (!needle)
            {
                return true;
            }
            return [u.username, u.email, u.fullName, u.phone, u.role]
                .some((v) => (v || '').toLowerCase().includes(needle));
        });
    }, [users, search, roleFilter]);
    const fetched = usersQuery.data !== undefined || usersQuery.isError;
    const fetchError = usersQuery.error ? (usersQuery.error as Error).message : '';

    const stats = useMemo(() =>
    {
        // Count each role explicitly (normalizing legacy "user" -> reseller).
        // The old code derived resellers as total - admins, which wrongly counted
        // moderators and members as resellers.
        let admins = 0;
        let resellers = 0;
        let totalBalance = 0;
        for (const u of users)
        {
            const role = normalizeRole(u.role);
            if (role === 'admin')
            {
                admins += 1;
            }
            else if (role === 'reseller')
            {
                resellers += 1;
            }
            totalBalance += u.balance || 0;
        }
        return { total: users.length, admins, resellers, totalBalance };
    }, [users]);

    const invalidate = () =>
    {
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    };

    // ---- create / edit user ----
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [editing, setEditing] = useState<PanelUser | null>(null);

    const {
        register: registerUser,
        handleSubmit: handleSubmitUser,
        reset: resetUser,
        control: userControl,
        formState: { errors: userErrors }
    } = useForm<UserFormValues>({
        defaultValues: { username: '', role: 'reseller', balance: 0 }
    });

    const saveUserMut = useMutation({
        mutationFn: (values: UserFormValues) =>
        {
            const url = editing ? `/panel/api/admin/users/${ editing.id }` : '/panel/api/admin/users';
            return HttpUtil.post(url, values, JSON_HEADERS);
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
                setUserModalOpen(false);
                messageApi.success(editing ? t('pages.users.toasts.userUpdated') : t('pages.users.toasts.userCreated'));
            }
        }
    });

    function openCreate()
    {
        setEditing(null);
        resetUser({ username: '', password: '', fullName: '', phone: '', email: '', role: 'reseller', balance: 0, costPerGbOverride: undefined });
        setUserModalOpen(true);
    }

    function openEdit(row: PanelUser)
    {
        setEditing(row);
        resetUser({
            username: row.username,
            password: '',
            fullName: row.fullName,
            phone: row.phone,
            email: row.email,
            role: normalizeRole(row.role),
            costPerGbOverride: row.costPerGbOverride || undefined
        });
        setUserModalOpen(true);
    }

    // RHF `register` on number inputs yields strings; coerce to numbers (empty ->
    // undefined so the backend keeps its default).
    const toNum = (v: unknown): number | undefined =>
    {
        if (v === '' || v == null)
        {
            return undefined;
        }
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
    };

    const submitUser = handleSubmitUser((values) =>
        saveUserMut.mutateAsync({
            ...values,
            balance: toNum(values.balance),
            costPerGbOverride: toNum(values.costPerGbOverride)
        })
    );

    async function onDelete(row: PanelUser)
    {
        const ok = await confirm({
            title: t('pages.users.deleteConfirmTitle', { name: row.username }),
            description: t('pages.users.deleteConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/admin/users/${ row.id }/del`);
        if (msg?.success)
        {
            invalidate();
        }
    }

    // ---- balance adjustment ----
    const [balanceTarget, setBalanceTarget] = useState<PanelUser | null>(null);

    const {
        register: registerBalance,
        handleSubmit: handleSubmitBalance,
        reset: resetBalance,
        control: balanceControl,
        formState: { errors: balanceErrors }
    } = useForm<BalanceFormValues>({
        defaultValues: { op: 'add', amount: 0, description: '' }
    });

    const balanceMut = useMutation({
        mutationFn: (body: BalanceFormValues) =>
            HttpUtil.post(`/panel/api/admin/users/${ balanceTarget!.id }/balance`, body, JSON_HEADERS),
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

    function openBalance(row: PanelUser)
    {
        setBalanceTarget(row);
        resetBalance({ op: 'add', amount: 0, description: '' });
    }

    const submitBalance = handleSubmitBalance((values) =>
        balanceMut.mutateAsync({ ...values, amount: Number(values.amount) })
    );

    // ---- transaction history ----
    const [historyTarget, setHistoryTarget] = useState<PanelUser | null>(null);
    const txQuery = useQuery({
        queryKey: ['admin', 'transactions', historyTarget?.id],
        queryFn: () => fetchTransactions(historyTarget!.id),
        enabled: !!historyTarget
    });

    // Setting a user to "manager" here auto-provisions their workspace (tenant +
    // slug) server-side; the admin then mints an API key from the Managers page.
    const roleOptions = [
        { value: 'admin', label: t('pages.users.role_admin') },
        { value: 'manager', label: t('pages.users.role_manager') },
        { value: 'reseller', label: t('pages.users.role_reseller') },
        { value: 'member', label: t('pages.users.role_member') }
    ];

    const columns: Column<PanelUser>[] = [
        {
            key: 'actions',
            header: t('pages.users.actions'),
            width: 170,
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
          <Tooltip content={t('pages.users.history')}>
            <Button aria-label={t('pages.users.history')} variant="ghost" size="icon" onClick={() => setHistoryTarget(row)}>
              <History className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('delete')}>
            <Button
              aria-label={t('delete')}
              variant="ghost"
              size="icon"
              disabled={!!me && me.id === row.id}
              onClick={() => onDelete(row)}
              className="text-danger hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
            )
        },
        {
            key: 'username',
            header: t('username'),
            accessor: (row) => row.username,
            sortable: true,
            cell: (row) => <span className="font-medium">{row.username}</span>
        },
        {
            key: 'role',
            header: t('pages.users.role'),
            accessor: (row) => normalizeRole(row.role),
            sortable: true,
            cell: (row) =>
            {
                const r = normalizeRole(row.role);
                return <Badge variant={ROLE_BADGE[r] ?? 'neutral'}>{t(`pages.users.role_${ r }`)}</Badge>;
            }
        },
        {
            key: 'email',
            header: t('emailAddress'),
            accessor: (row) => row.email || '',
            cell: (row) => <span className="text-muted-foreground">{row.email || '—'}</span>,
            className: 'hidden md:table-cell'
        },
        {
            key: 'balance',
            header: t('balance'),
            accessor: (row) => row.balance,
            sortable: true,
            cell: (row) => <strong className="tabular-nums">{formatMoney(row.balance)}</strong>
        }
    ];

    const txColumns: Column<Transaction>[] = [
        {
            key: 'type',
            header: t('pages.users.txType'),
            cell: (row) => (
        <Badge variant={row.type === 'credit' ? 'success' : 'danger'}>
          {t(`pages.users.tx_${ row.type === 'credit' ? 'credit' : 'debit' }`)}
        </Badge>
            )
        },
        { key: 'amount', header: t('pages.users.txAmount'), cell: (row) => <span className="tabular-nums">{formatNumber(row.amount)}</span> },
        {
            key: 'balanceBefore',
            header: t('pages.users.txBefore'),
            cell: (row) => <span className="tabular-nums">{formatNumber(row.balanceBefore)}</span>,
            className: 'hidden sm:table-cell'
        },
        { key: 'balanceAfter', header: t('pages.users.txAfter'), cell: (row) => <span className="tabular-nums">{formatNumber(row.balanceAfter)}</span> },
        {
            key: 'description',
            header: t('pages.users.txDescription'),
            cell: (row) => <span className="text-muted-foreground">{row.description}</span>,
            className: 'hidden md:table-cell'
        },
        {
            key: 'createdAt',
            header: t('pages.users.txDate'),
            cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{IntlUtil.formatDate(row.createdAt)}</span>
        }
    ];

    const pageClass = useMemo(() => `users-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    return (
    <PageShell
      name={pageClass}
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.users.addUser')}
        </Button>
      }
    >
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : fetchError ? (
              <ErrorState message={fetchError} onRetry={() => usersQuery.refetch()} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                  <StatCard title={t('pages.users.totalUsers')} value={String(stats.total)} icon={<Users className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.users.admins')} value={String(stats.admins)} icon={<Crown className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.users.resellers')} value={String(stats.resellers)} icon={<User className="h-5 w-5" aria-hidden />} />
                  <StatCard
                    title={t('pages.users.totalBalance')}
                    value={
                      <span className="tabular-nums">
                        {formatNumber(stats.totalBalance)} <span className="text-sm font-medium text-muted-foreground">{unit}</span>
                      </span>
                    }
                    icon={<Wallet className="h-5 w-5" aria-hidden />}
                  />
                </div>

                <Card className="p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                    <Select
                      className="w-full sm:w-44"
                      aria-label={t('pages.users.roleFilter', { defaultValue: 'Filter by role' })}
                      value={roleFilter}
                      onChange={setRoleFilter}
                      options={[
                          { value: 'all', label: t('pages.users.allRoles', { defaultValue: 'All roles' }) },
                          ...roleOptions
                      ]}
                    />
                    <SearchInput
                      className="w-full max-w-[280px] sm:w-auto"
                      aria-label={t('pages.users.searchPlaceholder')}
                      placeholder={t('pages.users.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <Table<PanelUser>
                    columns={columns}
                    data={filteredUsers}
                    rowKey={(row) => String(row.id)}
                    loading={usersQuery.isFetching}
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

        {/* Create / edit user */}
        <Modal
          open={userModalOpen}
          onClose={() => setUserModalOpen(false)}
          title={editing ? t('pages.users.editUser') : t('pages.users.addUser')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUserModalOpen(false)}>{t('cancel')}</Button>
              <Button onClick={() => submitUser()} loading={saveUserMut.isPending}>{t('save')}</Button>
            </>
          }
        >
          <form noValidate onSubmit={submitUser} className="flex flex-col gap-4">
            <Field label={t('username')} htmlFor="user-username" error={userErrors.username?.message}>
              <Input
                id="user-username"
                autoComplete="off"
                aria-invalid={!!userErrors.username}
                {...registerUser('username', {
                    required: t('pages.register.errors.username'),
                    pattern: { value: /^[A-Za-z0-9_]{3,32}$/, message: t('pages.register.errors.username') }
                })}
              />
            </Field>

            <Field
              label={t('password')}
              htmlFor="user-password"
              hint={editing ? t('pages.users.passwordEditHint') : undefined}
              error={userErrors.password?.message}
            >
              <PasswordInput
                id="user-password"
                autoComplete="new-password"
                aria-invalid={!!userErrors.password}
                {...registerUser('password', editing
                    ? {}
                    : {
                        required: t('pages.register.errors.password'),
                        minLength: { value: 8, message: t('pages.register.errors.password') }
                    })}
              />
            </Field>

            <Field label={t('fullName')} htmlFor="user-fullName">
              <Input id="user-fullName" autoComplete="off" {...registerUser('fullName')} />
            </Field>

            <Field label={t('phoneNumber')} htmlFor="user-phone">
              <Input id="user-phone" autoComplete="off" {...registerUser('phone')} />
            </Field>

            <Field label={t('emailAddress')} htmlFor="user-email">
              <Input id="user-email" autoComplete="off" {...registerUser('email')} />
            </Field>

            <Field label={t('pages.users.role')} htmlFor="user-role">
              <Controller
                control={userControl}
                name="role"
                rules={{ required: true }}
                render={({ field }) => (
                  <Select id="user-role" value={field.value} onChange={field.onChange} options={roleOptions} />
                )}
              />
            </Field>

            {!editing && (
              <Field label={t('pages.users.initialBalance')} htmlFor="user-balance">
                <UnitInput id="user-balance" min={0} unit={unit} {...registerUser('balance')} />
              </Field>
            )}

            <Field
              label={t('pages.users.costPerGb')}
              htmlFor="user-costPerGb"
              hint={t('pages.users.costPerGbHint')}
            >
              <UnitInput
                id="user-costPerGb"
                min={0}
                placeholder={t('pages.users.costPerGbDefault')}
                unit={unit}
                {...registerUser('costPerGbOverride')}
              />
            </Field>
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
              <Button onClick={() => submitBalance()} loading={balanceMut.isPending}>{t('confirm')}</Button>
            </>
          }
        >
          {balanceTarget && (
            <p className="mb-4 text-sm">
              {t('balance')}: <strong className="tabular-nums">{formatMoney(balanceTarget.balance)}</strong>
            </p>
          )}
          <form noValidate onSubmit={submitBalance} className="flex flex-col gap-4">
            <Field label={t('pages.users.operation')}>
              <Controller
                control={balanceControl}
                name="op"
                render={({ field }) => (
                  <Tabs
                    variant="segmented"
                    fullWidth
                    value={field.value}
                    onChange={(k) => field.onChange(k as BalanceOp)}
                    aria-label={t('pages.users.operation')}
                    tabs={[
                        { key: 'add', label: t('pages.users.opAdd') },
                        { key: 'deduct', label: t('pages.users.opDeduct') },
                        { key: 'set', label: t('pages.users.opSet') }
                    ]}
                  />
                )}
              />
            </Field>

            <Field label={t('pages.users.amount')} htmlFor="balance-amount" error={balanceErrors.amount?.message}>
              <UnitInput
                id="balance-amount"
                min={0}
                unit={unit}
                aria-invalid={!!balanceErrors.amount}
                {...registerBalance('amount', {
                    required: t('pages.users.toasts.invalidAmount'),
                    min: { value: 0, message: t('pages.users.toasts.invalidAmount') },
                    valueAsNumber: true
                })}
              />
            </Field>

            <Field label={t('pages.users.txDescription')} htmlFor="balance-description">
              <Input id="balance-description" maxLength={200} {...registerBalance('description')} />
            </Field>
          </form>
        </Modal>

        {/* Transaction history */}
        <Modal
          open={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          title={historyTarget ? t('pages.users.historyTitle', { name: historyTarget.username }) : ''}
          size="xl"
        >
          <Table<Transaction>
            columns={txColumns}
            data={txQuery.data ?? []}
            rowKey={(row) => String(row.id)}
            loading={txQuery.isFetching}
            pageSize={10}
            empty={<div className="py-6 text-center text-muted-foreground">{t('noData')}</div>}
          />
        </Modal>
    </PageShell>
    );
}
