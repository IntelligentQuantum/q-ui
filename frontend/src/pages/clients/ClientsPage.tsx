import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    EllipsisVertical,
    Info,
    Link2,
    ListFilter,
    Pencil,
    Plus,
    QrCode,
    Repeat,
    Tag as TagIcon,
    Trash2,
    Users,
    UserMinus,
    UserPlus,
    X
} from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMe } from '@/hooks/useMe';
import { useClients } from '@/hooks/useClients';
import { useDatepicker } from '@/hooks/useDatepicker';
import type { ClientRecord, InboundOption } from '@/hooks/useClients';
import PageShell from '@/layouts/PageShell';
import { IntlUtil, SizeFormatter } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import { LazyMount } from '@/components/utility';
import {
    Badge,
    Button,
    Card,
    Checkbox,
    DropdownMenu,
    SearchInput,
    Select,
    Spinner,
    StatCard,
    Switch,
    Table,
    Tooltip,
    cn,
    confirm
} from '@/components/ui';
import type { Column, DropdownItem } from '@/components/ui';
const ClientFormModal = lazy(() => import('./ClientFormModal'));
const ClientInfoModal = lazy(() => import('./ClientInfoModal'));
const ClientQrModal = lazy(() => import('./ClientQrModal'));
const ClientBulkAddModal = lazy(() => import('./ClientBulkAddModal'));
const ClientBulkAdjustModal = lazy(() => import('./ClientBulkAdjustModal'));
const FilterDrawer = lazy(() => import('./FilterDrawer'));
const SubLinksModal = lazy(() => import('./SubLinksModal'));
const BulkAddToGroupModal = lazy(() => import('./BulkAddToGroupModal'));
const BulkAttachInboundsModal = lazy(() => import('./BulkAttachInboundsModal'));
const BulkDetachInboundsModal = lazy(() => import('./BulkDetachInboundsModal'));
import { emptyFilters, activeFilterCount } from './filters';
import type { ClientFilters } from './filters';

const FILTER_STATE_KEY = 'clientsFilterState';
const DISABLED_PAGE_SIZE = 200;

// A tags icon with a diagonal strike, used for "ungroup".
function UngroupIcon({ className }: { className?: string })
{
    return (
    <span className={cn('relative inline-flex h-4 w-4 items-center justify-center', className)}>
      <TagIcon className="h-4 w-4" aria-hidden />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="block h-px w-[125%] rotate-45 rounded-[1px] bg-current" />
      </span>
    </span>
    );
}

type Bucket = 'active' | 'deactive' | 'depleted' | 'expiring';

interface PersistedFilterState {
  searchKey: string;
  filters: ClientFilters;
  sort: string;
}

const INBOUND_CHIP_LIMIT = 1;

function readFilterState(): PersistedFilterState
{
    try
    {
        const raw = JSON.parse(localStorage.getItem(FILTER_STATE_KEY) || '{}');
        const fromRaw = (raw.filters ?? {}) as Partial<ClientFilters>;
        return {
            searchKey: typeof raw.searchKey === 'string' ? raw.searchKey : '',
            filters: {
                ...emptyFilters(),
                ...fromRaw,
                buckets: Array.isArray(fromRaw.buckets) ? fromRaw.buckets : [],
                protocols: Array.isArray(fromRaw.protocols) ? fromRaw.protocols : [],
                inboundIds: Array.isArray(fromRaw.inboundIds) ? fromRaw.inboundIds : [],
                groups: Array.isArray(fromRaw.groups) ? fromRaw.groups : []
            },
            sort: typeof raw.sort === 'string' ? raw.sort : ''
        };
    }
    catch
    {
        return { searchKey: '', filters: emptyFilters(), sort: '' };
    }
}

function gbToBytes(gb: number | undefined): number
{
    if (!gb || gb <= 0)
    {
        return 0;
    }
    return Math.round(gb * 1024 * 1024 * 1024);
}

const SORT_OPTIONS: { value: string; column: string; order: 'ascend' | 'descend'; labelKey: string }[] = [
    { value: 'createdAt:ascend',    column: 'createdAt',  order: 'ascend',   labelKey: 'pages.clients.sortOldest' },
    { value: 'createdAt:descend',   column: 'createdAt',  order: 'descend',  labelKey: 'pages.clients.sortNewest' },
    { value: 'updatedAt:descend',   column: 'updatedAt',  order: 'descend',  labelKey: 'pages.clients.sortRecentlyUpdated' },
    { value: 'lastOnline:descend',  column: 'lastOnline', order: 'descend',  labelKey: 'pages.clients.sortRecentlyOnline' },
    { value: 'email:ascend',        column: 'email',      order: 'ascend',   labelKey: 'pages.clients.sortEmailAZ' },
    { value: 'email:descend',       column: 'email',      order: 'descend',  labelKey: 'pages.clients.sortEmailZA' },
    { value: 'traffic:descend',     column: 'traffic',    order: 'descend',  labelKey: 'pages.clients.sortMostTraffic' },
    { value: 'remaining:descend',   column: 'remaining',  order: 'descend',  labelKey: 'pages.clients.sortHighestRemaining' },
    { value: 'expiryTime:ascend',   column: 'expiryTime', order: 'ascend',   labelKey: 'pages.clients.sortExpiringSoonest' }
];

const DEFAULT_SORT = SORT_OPTIONS[0];

function sortValueFor(column: string | null, order: 'ascend' | 'descend' | null): string
{
    if (!column || !order)
    {
        return DEFAULT_SORT.value;
    }
    return `${ column }:${ order }`;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

// Small token chip used for groups / owners / inbound protocols inside cells.
function Chip({
    children,
    tone = 'neutral',
    className,
    onClick,
    title
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
})
{
    const toneClass = {
        neutral: 'bg-surface-sunken text-muted-foreground',
        accent: 'bg-accent-subtle text-accent',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger'
    }[tone];
    return (
    <span
      onClick={onClick}
      title={title}
      className={cn(
          'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium',
          toneClass,
          onClick && 'cursor-pointer',
          className
      )}
    >
      {children}
    </span>
    );
}

export default function ClientsPage()
{
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { datepicker } = useDatepicker();
    const { isMobile } = useMediaQuery();
    const { me } = useMe();
    const isAdmin = !me || me.isAdmin;
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const {
        clients, total, filtered,
        summary: serverSummary,
        allGroups,
        setQuery,
        inbounds, onlines, loading, fetched, fetchError, subSettings,
        ipLimitEnable, tgBotEnable, expireDiff, trafficDiff, pageSize,
        create, update, remove, bulkDelete, bulkAdjust, bulkAddToGroup, bulkRemoveFromGroup, attach, bulkAttach, detach, bulkDetach,
        resetTraffic, resetAllTraffics, delDepleted, setEnable,
        applyTrafficEvent, applyClientStatsEvent,
        refresh,
        hydrate
    } = useClients();

    useWebSocket({
        traffic: applyTrafficEvent,
        client_stats: applyClientStatsEvent
    });

    const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
    const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
    const [editingAttachedIds, setEditingAttachedIds] = useState<number[]>([]);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoClient, setInfoClient] = useState<ClientRecord | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    const [qrClient, setQrClient] = useState<ClientRecord | null>(null);
    const [bulkAddOpen, setBulkAddOpen] = useState(false);
    const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
    const [subLinksOpen, setSubLinksOpen] = useState(false);
    const [bulkGroupOpen, setBulkGroupOpen] = useState(false);
    const [bulkAttachOpen, setBulkAttachOpen] = useState(false);
    const [bulkDetachOpen, setBulkDetachOpen] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

    const initial = readFilterState();
    const [searchKey, setSearchKey] = useState(initial.searchKey);
    const [filters, setFilters] = useState<ClientFilters>(initial.filters);
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

    const initialSort = SORT_OPTIONS.find((o) => o.value === initial.sort) ?? DEFAULT_SORT;
    const [sortColumn, setSortColumn] = useState<string | null>(initialSort.column);
    const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(initialSort.order);
    const [currentPage, setCurrentPage] = useState(1);
    const [tablePageSize, setTablePageSize] = useState(25);
    // debouncedSearch lags behind the input so we don't spam the server on every
    // keystroke; the search box still feels instant locally.
    const [debouncedSearch, setDebouncedSearch] = useState(searchKey);

    useEffect(() =>
    {
        localStorage.setItem(FILTER_STATE_KEY, JSON.stringify({ searchKey, filters, sort: sortValueFor(sortColumn, sortOrder) }));
    }, [searchKey, filters, sortColumn, sortOrder]);

    useEffect(() =>
    {
        const handle = window.setTimeout(() => setDebouncedSearch(searchKey), 300);
        return () => window.clearTimeout(handle);
    }, [searchKey]);

    useEffect(() =>
    {
    // Reset to page 1 whenever a filter or sort changes — otherwise an empty
    // result set on a high page number leaves the user staring at "no clients".
        setCurrentPage(1);
    }, [debouncedSearch, filters, sortColumn, sortOrder]);

    useEffect(() =>
    {
        setQuery({
            page: currentPage,
            pageSize: tablePageSize,
            search: debouncedSearch,
            filter: filters.buckets.join(','),
            protocol: filters.protocols.join(','),
            inbound: filters.inboundIds.join(','),
            expiryFrom: filters.expiryFrom,
            expiryTo: filters.expiryTo,
            usageFrom: gbToBytes(filters.usageFromGB),
            usageTo: gbToBytes(filters.usageToGB),
            autoRenew: filters.autoRenew || undefined,
            hasTgId: filters.hasTgId || undefined,
            hasComment: filters.hasComment || undefined,
            group: filters.groups.join(',') || undefined,
            sort: sortColumn || undefined,
            order: sortOrder || undefined
        });
    }, [setQuery, currentPage, tablePageSize, debouncedSearch, filters, sortColumn, sortOrder]);

    const activeCount = activeFilterCount(filters);

    useEffect(() =>
    {
        setTablePageSize(pageSize > 0 ? pageSize : DISABLED_PAGE_SIZE);
    }, [pageSize]);

    const onlineSet = useMemo(() => new Set(onlines || []), [onlines]);
    const inboundsById = useMemo(() =>
    {
        const out: Record<number, InboundOption> = {};
        for (const ib of inbounds)
        {
            out[ib.id] = ib;
        }
        return out;
    }, [inbounds]);

    const protocolOptions = useMemo(() =>
    {
        const values = new Set<string>((inbounds || []).map((i) => i.protocol).filter((x): x is string => !!x));
        return [...values].sort();
    }, [inbounds]);

    const groupOptions = useMemo(() =>
    {
        const values = new Set<string>(allGroups);
        for (const g of filters.groups)
        {
            values.add(g);
        }
        return [...values].sort((a, b) => a.localeCompare(b));
    }, [allGroups, filters.groups]);

    const isOnline = useCallback((email: string) => !!email && onlineSet.has(email), [onlineSet]);

    function inboundLabel(id: number)
    {
        const ib = inboundsById[id];
        return ib?.remark?.trim() || ib?.tag || '';
    }

    const clientBucket = useCallback((row: ClientRecord | null | undefined): Bucket | null =>
    {
        if (!row)
        {
            return null;
        }
        const traffic = row.traffic || {};
        const used = (traffic.up || 0) + (traffic.down || 0);
        const total = row.totalGB || 0;
        const now = Date.now();
        const expired = (row.expiryTime ?? 0) > 0 && (row.expiryTime ?? 0) <= now;
        const exhausted = total > 0 && used >= total;
        if (expired || exhausted)
        {
            return 'depleted';
        }
        if (!row.enable)
        {
            return 'deactive';
        }
        const nearExpiry = (row.expiryTime ?? 0) > 0 && (row.expiryTime ?? 0) - now < (expireDiff || 0);
        const nearLimit = total > 0 && total - used < (trafficDiff || 0);
        if (nearExpiry || nearLimit)
        {
            return 'expiring';
        }
        return 'active';
    }, [expireDiff, trafficDiff]);

    // The list page renders rows the server already sorted, filtered, and
    // paginated. Local filtering is gone — keep the variable name so the rest
    // of the file (table data, mobile cards, select-all) doesn't need a rename.
    const filteredClients = clients;

    // Server-computed counts that stay stable as the user paginates/filters.
    const summary = serverSummary;

    // Sort is server-side now; the page already arrives in the requested
    // order, so we just hand it through.
    const sortedClients = filteredClients;

    function trafficLabel(row: ClientRecord)
    {
        const t0 = row.traffic;
        if (!t0)
        {
            return '-';
        }
        const used = (t0.up || 0) + (t0.down || 0);
        const total = row.totalGB || 0;
        if (total <= 0)
        {
            return `${ SizeFormatter.sizeFormat(used) } / ∞`;
        }
        return `${ SizeFormatter.sizeFormat(used) } / ${ SizeFormatter.sizeFormat(total) }`;
    }

    function remainingLabel(row: ClientRecord)
    {
        const total = row.totalGB || 0;
        if (total <= 0)
        {
            return '∞';
        }
        const used = (row.traffic?.up || 0) + (row.traffic?.down || 0);
        const r = total - used;
        return r > 0 ? SizeFormatter.sizeFormat(r) : '0';
    }

    function remainingTone(row: ClientRecord): 'accent' | 'success' | 'warning' | 'danger'
    {
        const total = row.totalGB || 0;
        if (total <= 0)
        {
            return 'accent';
        }
        const used = (row.traffic?.up || 0) + (row.traffic?.down || 0);
        const ratio = used / total;
        if (ratio >= 1)
        {
            return 'danger';
        }
        if (ratio >= 0.85)
        {
            return 'warning';
        }
        return 'success';
    }

    function expiryLabel(row: ClientRecord)
    {
        if (!row.expiryTime)
        {
            return '∞';
        }
        if (row.expiryTime < 0)
        {
            const days = Math.round(row.expiryTime / -86400000);
            return `${ t('pages.clients.delayedStart') }: ${ days }d`;
        }
        return IntlUtil.formatDate(row.expiryTime, datepicker);
    }

    function expiryRelative(row: ClientRecord)
    {
        if (!row.expiryTime)
        {
            return '';
        }
        if (row.expiryTime < 0)
        {
            const days = Math.round(row.expiryTime / -86400000);
            return `${ days }d`;
        }
        return IntlUtil.formatRelativeTime(row.expiryTime);
    }

    function expiryTone(row: ClientRecord): 'accent' | 'neutral' | 'success' | 'warning' | 'danger'
    {
        if (!row.expiryTime)
        {
            return 'accent';
        }
        if (row.expiryTime < 0)
        {
            return 'neutral';
        }
        const now = Date.now();
        if (row.expiryTime <= now)
        {
            return 'danger';
        }
        if (row.expiryTime - now < 86400 * 1000 * 3)
        {
            return 'warning';
        }
        return 'success';
    }

    async function onToggleEnable(row: ClientRecord, next: boolean)
    {
        setTogglingEmail(row.email);
        try
        {
            const msg = await setEnable(row, next);
            if (!msg?.success)
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
        finally
        {
            setTogglingEmail(null);
        }
    }

    function onAdd()
    {
        setFormMode('add');
        setEditingClient(null);
        setEditingAttachedIds([]);
        setFormOpen(true);
    }

    async function onEdit(row: ClientRecord)
    {
        setFormMode('edit');
        // Paged list omits per-client secrets to keep the row payload tiny;
        // edit needs them, so fetch the full record first.
        const full = await hydrate(row.email);
        const merged: ClientRecord = full ? { ...row, ...full.client } : { ...row };
        setEditingClient(merged);
        const ids = full?.inboundIds ?? (Array.isArray(row.inboundIds) ? row.inboundIds : []);
        setEditingAttachedIds([...ids]);
        setFormOpen(true);
    }

    async function onDelete(row: ClientRecord)
    {
        const ok = await confirm({
            title: t('pages.clients.deleteConfirmTitle', { email: row.email }),
            description: t('pages.clients.deleteConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await remove(row.email);
        if (msg?.success)
        {
            messageApi.success(t('pages.clients.toasts.deleted'));
        }
    }

    async function onResetTraffic(row: ClientRecord)
    {
        if (!row?.email)
        {
            messageApi.warning(t('pages.clients.resetNotPossible'));
            return;
        }
        const ok = await confirm({
            title: `${ t('pages.inbounds.resetTraffic') } — ${ row.email }`,
            description: t('pages.inbounds.resetTrafficContent'),
            confirmText: t('reset'),
            cancelText: t('cancel')
        });
        if (!ok)
        {
            return;
        }
        const msg = await resetTraffic(row);
        if (msg?.success)
        {
            messageApi.success(t('pages.clients.toasts.trafficReset'));
        }
    }

    async function onShowInfo(row: ClientRecord)
    {
        const full = await hydrate(row.email);
        setInfoClient(full ? { ...row, ...full.client, inboundIds: full.inboundIds } : row);
        setInfoOpen(true);
    }

    async function onShowQr(row: ClientRecord)
    {
        const full = await hydrate(row.email);
        setQrClient(full ? { ...row, ...full.client, inboundIds: full.inboundIds } : row);
        setQrOpen(true);
    }

    async function onResetAllTraffics()
    {
        const ok = await confirm({
            title: t('pages.clients.resetAllTrafficsTitle'),
            description: t('pages.clients.resetAllTrafficsContent'),
            confirmText: t('reset'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await resetAllTraffics();
        if (msg?.success)
        {
            messageApi.success(t('pages.clients.toasts.allTrafficsReset'));
        }
    }

    async function onDelDepleted()
    {
        const ok = await confirm({
            title: t('pages.clients.delDepletedConfirmTitle'),
            description: t('pages.clients.delDepletedConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await delDepleted();
        if (msg?.success)
        {
            const deleted = msg.obj?.deleted ?? 0;
            messageApi.success(t('pages.clients.toasts.delDepleted', { count: deleted }));
        }
    }

    async function onBulkUngroup()
    {
        const emails = [...selectedRowKeys];
        if (emails.length === 0)
        {
            return;
        }
        const ok = await confirm({
            title: t('pages.clients.ungroupConfirmTitle', { count: emails.length }),
            description: t('pages.clients.ungroupConfirmContent'),
            confirmText: t('confirm'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await bulkRemoveFromGroup(emails);
        if (msg?.success)
        {
            setSelectedRowKeys([]);
            const affected = (msg.obj as { affected?: number } | undefined)?.affected ?? emails.length;
            messageApi.success(t('pages.clients.ungroupSuccessToast', { count: affected }));
        }
    }

    async function onBulkDelete()
    {
        const emails = [...selectedRowKeys];
        if (emails.length === 0)
        {
            return;
        }
        const ok = await confirm({
            title: t('pages.clients.bulkDeleteConfirmTitle', { count: emails.length }),
            description: t('pages.clients.bulkDeleteConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await bulkDelete(emails);
        setSelectedRowKeys([]);
        const okCount = msg?.obj?.deleted ?? 0;
        const skipped = msg?.obj?.skipped ?? [];
        const failed = skipped.length;
        const firstError = skipped[0]?.reason ?? msg?.msg ?? '';
        if (failed === 0 && msg?.success)
        {
            messageApi.success(t('pages.clients.toasts.bulkDeleted', { count: okCount }));
        }
        else
        {
            messageApi.warning(firstError
                ? `${ t('pages.clients.toasts.bulkDeletedMixed', { ok: okCount, failed }) } — ${ firstError }`
                : t('pages.clients.toasts.bulkDeletedMixed', { ok: okCount, failed }));
        }
    }

    const onSave = useCallback(async (
        payload: Record<string, unknown> | { client: Record<string, unknown>; inboundIds: number[] },
        meta: { isEdit: false } | { isEdit: true; email: string; attach: number[]; detach: number[] }
    ) =>
    {
        if (!meta.isEdit)
        {
            return create(payload);
        }
        const updateMsg = await update(meta.email, payload);
        if (!updateMsg?.success)
        {
            return updateMsg;
        }
        if (Array.isArray(meta.attach) && meta.attach.length > 0)
        {
            const r = await attach(meta.email, meta.attach);
            if (!r?.success)
            {
                return r;
            }
        }
        if (Array.isArray(meta.detach) && meta.detach.length > 0)
        {
            const r = await detach(meta.email, meta.detach);
            if (!r?.success)
            {
                return r;
            }
        }
        return updateMsg;
    }, [create, update, attach, detach]);

    const pageClass = useMemo(() => `clients-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    // Pagination math (server-side: `filtered` is the total matching count).
    const pageCount = Math.max(1, Math.ceil(filtered / tablePageSize));
    const showPagination = filtered > tablePageSize || (filtered > 10 && tablePageSize > filtered);
    const rangeFrom = filtered === 0 ? 0 : (currentPage - 1) * tablePageSize + 1;
    const rangeTo = Math.min(currentPage * tablePageSize, filtered);

    function gotoPage(p: number)
    {
        setCurrentPage(Math.max(1, Math.min(pageCount, p)));
    }

    function inboundChips(ids: number[])
    {
        if (ids.length === 0)
        {
            return <span className="text-muted-foreground">—</span>;
        }
        const visible = ids.slice(0, INBOUND_CHIP_LIMIT);
        const overflow = ids.slice(INBOUND_CHIP_LIMIT);
        return (
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((id) => (
          <Tooltip key={id} content={inboundLabel(id)}>
            <Chip tone="accent">{inboundLabel(id)}</Chip>
          </Tooltip>
        ))}
        {overflow.length > 0 && (
          <Tooltip
            content={
              <div className="flex max-h-64 max-w-[260px] flex-col gap-1 overflow-y-auto">
                {overflow.map((id) => (
                  <span key={id} className="truncate text-xs">{inboundLabel(id)}</span>
                ))}
              </div>
            }
          >
            <Chip tone="neutral">+{overflow.length}</Chip>
          </Tooltip>
        )}
      </div>
        );
    }

    function onlineCell(record: ClientRecord)
    {
        const bucket = clientBucket(record);
        const lastOnline = record.traffic?.lastOnline ?? 0;
        const lastOnlineTitle = `${ t('lastOnline') }: ${ lastOnline > 0 ? IntlUtil.formatDate(lastOnline, datepicker) : '-' }`;
        if (bucket === 'depleted')
        {
            return (
        <Tooltip content={lastOnlineTitle}>
          <Chip tone="danger">{t('depleted')}</Chip>
        </Tooltip>
            );
        }
        if (record.enable && isOnline(record.email))
        {
            return (
        <Chip tone="success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {t('pages.clients.online')}
        </Chip>
            );
        }
        if (!record.enable)
        {
            return <Chip tone="neutral">{t('disabled')}</Chip>;
        }
        if (bucket === 'expiring')
        {
            return <Chip tone="warning">{t('depletingSoon')}</Chip>;
        }
        return (
      <Tooltip content={lastOnlineTitle}>
        <Chip tone="neutral">{t('pages.clients.offline')}</Chip>
      </Tooltip>
        );
    }

    function rowActions(record: ClientRecord)
    {
        return (
      <div className="flex items-center gap-0.5">
        <Tooltip content={t('pages.clients.qrCode')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('pages.clients.qrCode')} onClick={() => onShowQr(record)}>
            <QrCode className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={t('pages.clients.clientInfo')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('pages.clients.clientInfo')} onClick={() => onShowInfo(record)}>
            <Info className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={t('pages.inbounds.resetTraffic')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('pages.inbounds.resetTraffic')} onClick={() => onResetTraffic(record)}>
            <Repeat className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={t('edit')}>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t('edit')} onClick={() => onEdit(record)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={t('delete')}>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-danger hover:text-danger" aria-label={t('delete')} onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>
        );
    }

    const columns = useMemo<Column<ClientRecord>[]>(() =>
    {
        const cols: Column<ClientRecord>[] = [
            {
                key: 'actions',
                header: t('pages.clients.actions'),
                width: 210,
                cell: (record) => rowActions(record)
            },
            {
                key: 'enable',
                header: t('pages.clients.enabled'),
                width: 90,
                cell: (record) => (
          <Switch
            checked={!!record.enable}
            disabled={togglingEmail === record.email}
            onCheckedChange={(next) => onToggleEnable(record, next)}
            aria-label={t('pages.clients.enabled')}
          />
                )
            },
            {
                key: 'online',
                header: t('pages.clients.online'),
                width: 100,
                hideBelow: 'md',
                cell: (record) => onlineCell(record)
            },
            {
                key: 'email',
                header: t('pages.clients.client'),
                cell: (record) => (
          <div className="flex flex-col">
            <span className="font-medium">{record.email}</span>
            {record.subId && (
              <span className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground" title={record.subId}>{record.subId}</span>
            )}
            {record.comment && (
              <span className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground" title={record.comment}>{record.comment}</span>
            )}
          </div>
                )
            }
        ];

        if (isAdmin)
        {
            cols.push({
                key: 'owner',
                header: t('pages.clients.owner'),
                width: 140,
                hideBelow: 'lg',
                cell: (record) =>
                {
                    const owner = (record as ClientRecord & { ownerName?: string; ownerId?: number });
                    if (owner.ownerName)
                    {
                        return (
              <Chip
                tone="accent"
                title={t('pages.clients.filterByOwner', { name: owner.ownerName })}
                onClick={() => setSearchKey(owner.ownerName as string)}
              >
                {owner.ownerName}
              </Chip>
                        );
                    }
                    return <span className="text-muted-foreground">—</span>;
                }
            });
        }

        if (allGroups.length > 0)
        {
            cols.push({
                key: 'group',
                header: t('pages.clients.group'),
                width: 140,
                hideBelow: 'lg',
                cell: (record) =>
                {
                    if (!record.group)
                    {
                        return <span className="text-muted-foreground">—</span>;
                    }
                    const isActive = filters.groups.includes(record.group);
                    return (
            <Chip
              tone="accent"
              className={isActive ? 'opacity-60' : undefined}
              onClick={(e) =>
              {
                  e.stopPropagation();
                  if (!isActive)
                  {
                      setFilters({ ...filters, groups: [...filters.groups, record.group!] });
                  }
              }}
            >
              {record.group}
            </Chip>
                    );
                }
            });
        }

        cols.push(
            {
                key: 'inboundIds',
                header: t('pages.clients.attachedInbounds'),
                width: 180,
                hideBelow: 'lg',
                cell: (record) => inboundChips(record.inboundIds || [])
            },
            {
                key: 'traffic',
                header: t('pages.clients.traffic'),
                cell: (record) => trafficLabel(record)
            },
            {
                key: 'remaining',
                header: t('pages.clients.remaining'),
                width: 140,
                hideBelow: 'md',
                cell: (record) => <Chip tone={remainingTone(record)}>{remainingLabel(record)}</Chip>
            },
            {
                key: 'expiryTime',
                header: t('pages.clients.duration'),
                hideBelow: 'sm',
                cell: (record) => (
          <Tooltip content={expiryLabel(record)}>
            <Chip tone={expiryTone(record)}>{record.expiryTime ? expiryRelative(record) : '∞'}</Chip>
          </Tooltip>
                )
            }
        );

        return cols;
    }, [t, togglingEmail, clientBucket, isOnline, inboundsById, filters, allGroups, datepicker, isAdmin, setSearchKey]);

    function toggleSelect(email: string, checked: boolean)
    {
        setSelectedRowKeys((prev) =>
        {
            const next = new Set(prev);
            if (checked)
            {
                next.add(email);
            }
            else
            {
                next.delete(email);
            }
            return Array.from(next);
        });
    }

    function selectAll(checked: boolean)
    {
        setSelectedRowKeys(checked ? filteredClients.map((c) => c.email) : []);
    }

    const allSelected = filteredClients.length > 0 && selectedRowKeys.length === filteredClients.length;
    const someSelected = selectedRowKeys.length > 0 && selectedRowKeys.length < filteredClients.length;

    function clearOneFilter<K extends keyof ClientFilters>(key: K)
    {
        if (key === 'expiryFrom' || key === 'expiryTo')
        {
            setFilters({ ...filters, expiryFrom: undefined, expiryTo: undefined });
            return;
        }
        if (key === 'usageFromGB' || key === 'usageToGB')
        {
            setFilters({ ...filters, usageFromGB: undefined, usageToGB: undefined });
            return;
        }
        setFilters({ ...filters, [key]: emptyFilters()[key] });
    }

    // Build the "more" dropdown items, branching on whether a selection exists.
    const moreItems: DropdownItem[] = selectedRowKeys.length > 0
        ? [
            { key: 'adjust', icon: <Clock className="h-4 w-4" />, label: t('pages.clients.adjust'), onSelect: () => setBulkAdjustOpen(true) },
            { key: 'subLinks', icon: <Link2 className="h-4 w-4" />, label: t('pages.clients.subLinks'), onSelect: () => setSubLinksOpen(true) }
        ]
        : [
            { key: 'bulk', icon: <UserPlus className="h-4 w-4" />, label: t('pages.clients.bulk'), onSelect: () => setBulkAddOpen(true) },
            { key: 'resetAll', icon: <Repeat className="h-4 w-4" />, label: t('pages.clients.resetAllTraffics'), onSelect: onResetAllTraffics },
            { key: 'delDepleted', icon: <Trash2 className="h-4 w-4" />, label: t('pages.clients.delDepleted'), danger: true, onSelect: onDelDepleted }
        ];

    const summaryStats: { key: string; label: string; value: number; dot: string; list?: string[] }[] = [
        { key: 'total', label: t('clients'), value: summary.total, dot: 'bg-foreground/40' },
        { key: 'online', label: t('online'), value: summary.online.length, dot: 'bg-primary', list: summary.online },
        { key: 'depleted', label: t('depleted'), value: summary.depleted.length, dot: 'bg-danger', list: summary.depleted },
        { key: 'expiring', label: t('depletingSoon'), value: summary.expiring.length, dot: 'bg-warning', list: summary.expiring },
        { key: 'deactive', label: t('disabled'), value: summary.deactive.length, dot: 'bg-muted-foreground', list: summary.deactive },
        { key: 'active', label: t('subscription.active'), value: summary.active, dot: 'bg-success' }
    ];

    return (
    <PageShell name={pageClass}>
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-8 w-8 text-muted-foreground" label={t('loading')} />
              </div>
            ) : fetchError ? (
              <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-danger-subtle text-danger">
                  <X className="h-6 w-6" aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">{t('somethingWentWrong')}</h2>
                  <p className="text-sm text-muted-foreground">{fetchError}</p>
                </div>
                <Button loading={loading} onClick={refresh}>{t('refresh')}</Button>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {summaryStats.map((s) =>
                  {
                      const card = (
                      <StatCard
                        icon={<span className={cn('h-3 w-3 rounded-full', s.dot)} />}
                        label={s.label}
                        value={s.value}
                      />
                      );
                      if (s.list && s.list.length > 0)
                      {
                          return (
                        <Tooltip
                          key={s.key}
                          content={
                            <div className="flex max-h-64 min-w-[140px] flex-col gap-0.5 overflow-y-auto">
                              {s.list.map((e) => <span key={e} className="truncate text-xs">{e}</span>)}
                            </div>
                          }
                        >
                          <div>{card}</div>
                        </Tooltip>
                          );
                      }
                      return <div key={s.key}>{card}</div>;
                  })}
                </div>

                {/* List */}
                <Card className="flex flex-col gap-3 p-4">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedRowKeys.length === 0 ? (
                      <Button onClick={onAdd}>
                        <Plus className="h-4 w-4" aria-hidden />
                        {!isMobile && t('pages.clients.addClients')}
                      </Button>
                    ) : (
                      <>
                        <Badge variant="primary" className="gap-1.5 py-1">
                          {t('pages.clients.selectedCount', { count: selectedRowKeys.length })}
                          <button
                            type="button"
                            aria-label={t('cancel')}
                            onClick={() => setSelectedRowKeys([])}
                            className="grid h-4 w-4 place-items-center rounded-full hover:bg-accent/20"
                          >
                            <X className="h-3 w-3" aria-hidden />
                          </button>
                        </Badge>
                        <Button variant="secondary" onClick={() => setBulkAttachOpen(true)}>
                          <UserPlus className="h-4 w-4" aria-hidden />
                          {!isMobile && t('pages.clients.attach')}
                        </Button>
                        <Button variant="secondary" onClick={() => setBulkDetachOpen(true)} className="text-danger">
                          <UserMinus className="h-4 w-4" aria-hidden />
                          {!isMobile && t('pages.clients.detach')}
                        </Button>
                        <Button variant="secondary" onClick={() => setBulkGroupOpen(true)}>
                          <TagIcon className="h-4 w-4" aria-hidden />
                          {!isMobile && t('pages.clients.addToGroup')}
                        </Button>
                        <Button variant="secondary" onClick={onBulkUngroup} className="text-danger">
                          <UngroupIcon />
                          {!isMobile && t('pages.clients.ungroup')}
                        </Button>
                      </>
                    )}
                    <DropdownMenu
                      align="end"
                      label={t('more')}
                      items={moreItems}
                      trigger={
                        <>
                          <EllipsisVertical className="h-4 w-4" aria-hidden />
                          {!isMobile && t('more')}
                        </>
                      }
                    />
                    {selectedRowKeys.length > 0 && (
                      <Button variant="danger" onClick={onBulkDelete} className="ms-auto">
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {!isMobile && t('delete')}
                      </Button>
                    )}
                  </div>

                  {/* Filter bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchInput
                      className="w-full max-w-xs"
                      value={searchKey}
                      onChange={(e) => setSearchKey(e.target.value)}
                      placeholder={t('pages.clients.searchPlaceholder')}
                      aria-label={t('pages.clients.searchPlaceholder')}
                    />
                    <div className="relative">
                      <Button
                        variant={activeCount > 0 ? 'primary' : 'secondary'}
                        onClick={() => setFilterDrawerOpen(true)}
                      >
                        <ListFilter className="h-4 w-4" aria-hidden />
                        {!isMobile && t('filter')}
                      </Button>
                      {activeCount > 0 && (
                        <span className="absolute -end-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-danger-foreground">
                          {activeCount}
                        </span>
                      )}
                    </div>
                    <Select
                      value={sortValueFor(sortColumn, sortOrder)}
                      className="min-w-[150px] sm:min-w-[200px]"
                      onChange={(value) =>
                      {
                          const opt = SORT_OPTIONS.find((o) => o.value === value);
                          setSortColumn(opt?.column ?? null);
                          setSortOrder(opt?.order ?? null);
                      }}
                      options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                    />
                    {activeCount > 0 && (
                      <Button variant="secondary" onClick={() => setFilters(emptyFilters())}>
                        {t('pages.clients.clearAllFilters')}
                      </Button>
                    )}
                    {(activeCount > 0 || debouncedSearch.trim().length > 0) && (
                      <span className="ms-auto whitespace-nowrap text-sm text-muted-foreground">
                        {t('pages.clients.showingCount', { shown: filtered, total })}
                      </span>
                    )}
                  </div>

                  {/* Active filter chips */}
                  {activeCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 rounded-md bg-surface-sunken p-2">
                      {filters.buckets.map((b) => (
                        <RemovableChip key={`b-${ b }`} onRemove={() => setFilters({ ...filters, buckets: filters.buckets.filter((x) => x !== b) })}>
                          {bucketChipLabel(b, t)}
                        </RemovableChip>
                      ))}
                      {filters.protocols.map((p) => (
                        <RemovableChip key={`p-${ p }`} tone="accent" onRemove={() => setFilters({ ...filters, protocols: filters.protocols.filter((x) => x !== p) })}>
                          {p}
                        </RemovableChip>
                      ))}
                      {filters.inboundIds.map((id) => (
                        <RemovableChip key={`i-${ id }`} tone="accent" onRemove={() => setFilters({ ...filters, inboundIds: filters.inboundIds.filter((x) => x !== id) })}>
                          {inboundLabel(id)}
                        </RemovableChip>
                      ))}
                      {filters.groups.map((g) => (
                        <RemovableChip key={`g-${ g }`} tone="accent" onRemove={() => setFilters({ ...filters, groups: filters.groups.filter((x) => x !== g) })}>
                          {t('pages.clients.group')}: {g}
                        </RemovableChip>
                      ))}
                      {(filters.expiryFrom || filters.expiryTo) && (
                        <RemovableChip tone="accent" onRemove={() => clearOneFilter('expiryFrom')}>
                          {t('pages.clients.expiryTime')}: {filters.expiryFrom ? IntlUtil.formatDate(filters.expiryFrom, datepicker) : '…'}
                          {' → '}
                          {filters.expiryTo ? IntlUtil.formatDate(filters.expiryTo, datepicker) : '…'}
                        </RemovableChip>
                      )}
                      {(filters.usageFromGB || filters.usageToGB) && (
                        <RemovableChip tone="warning" onRemove={() => clearOneFilter('usageFromGB')}>
                          {t('pages.clients.traffic')}: {filters.usageFromGB ?? 0}{filters.usageToGB ? `–${ filters.usageToGB }` : '+'} GB
                        </RemovableChip>
                      )}
                      {filters.autoRenew && (
                        <RemovableChip tone="warning" onRemove={() => clearOneFilter('autoRenew')}>
                          {t('pages.clients.renew')}: {filters.autoRenew === 'on' ? t('enabled') : t('disabled')}
                        </RemovableChip>
                      )}
                      {filters.hasTgId && (
                        <RemovableChip onRemove={() => clearOneFilter('hasTgId')}>
                          {t('pages.clients.telegramId')}: {filters.hasTgId === 'yes' ? t('pages.clients.has') : t('pages.clients.hasNot')}
                        </RemovableChip>
                      )}
                      {filters.hasComment && (
                        <RemovableChip onRemove={() => clearOneFilter('hasComment')}>
                          {t('pages.clients.comment')}: {filters.hasComment === 'yes' ? t('pages.clients.has') : t('pages.clients.hasNot')}
                        </RemovableChip>
                      )}
                    </div>
                  )}

                  {!isMobile ? (
                    <>
                      <Table<ClientRecord>
                        columns={columns}
                        data={sortedClients}
                        loading={loading}
                        rowKey={(row) => row.email}
                        pageSize={0}
                        empty={
                          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                            <Users className="h-8 w-8" aria-hidden />
                            <div>{t('noData')}</div>
                          </div>
                        }
                      />
                      {showPagination && (
                        <PaginationBar
                          page={currentPage}
                          pageCount={pageCount}
                          pageSize={tablePageSize}
                          total={filtered}
                          rangeFrom={rangeFrom}
                          rangeTo={rangeTo}
                          onPage={gotoPage}
                          onPageSize={(s) =>
                          {
                              setTablePageSize(s); setCurrentPage(1);
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {loading && (
                        <div className="flex justify-center py-4">
                          <Spinner className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      {filteredClients.length > 0 && (
                        <div className="flex items-center gap-2 pb-1">
                          <Checkbox
                            checked={allSelected}
                            ref={(el) =>
                            {
                                if (el)
                                {
                                    el.indeterminate = someSelected;
                                }
                            }}
                            onChange={(e) => selectAll(e.target.checked)}
                          >
                            {t('pages.clients.selectAll')}
                          </Checkbox>
                          {selectedRowKeys.length > 0 && (
                            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent">{selectedRowKeys.length}</span>
                          )}
                        </div>
                      )}
                      {filteredClients.length === 0 && !loading && (
                        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                          <Users className="h-7 w-7 opacity-50" aria-hidden />
                          <div>{t('noData')}</div>
                        </div>
                      )}
                      {filteredClients.length > 0 && showPagination && (
                        <PaginationBar
                          page={currentPage}
                          pageCount={pageCount}
                          pageSize={tablePageSize}
                          total={filtered}
                          rangeFrom={rangeFrom}
                          rangeTo={rangeTo}
                          onPage={gotoPage}
                          onPageSize={(s) =>
                          {
                              setTablePageSize(s); setCurrentPage(1);
                          }}
                          compact
                        />
                      )}
                      {filteredClients.map((row) =>
                      {
                          const bucket = clientBucket(row);
                          const selected = selectedRowKeys.includes(row.email);
                          return (
                          <div
                            key={row.email}
                            className={cn(
                                'rounded-lg border p-3 transition-colors',
                                selected ? 'border-primary bg-accent-subtle/40' : 'border-border bg-surface-sunken'
                            )}
                          >
                            <div className="flex items-center gap-2 select-none">
                              <Checkbox
                                checked={selected}
                                onChange={(e) => toggleSelect(row.email, e.target.checked)}
                              />
                              <span
                                className={cn(
                                    'h-2 w-2 shrink-0 rounded-full',
                                    bucket === 'depleted' ? 'bg-danger'
                                        : bucket === 'expiring' ? 'bg-warning'
                                            : bucket === 'active' ? 'bg-success'
                                                : 'bg-muted-foreground'
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate font-semibold">{row.email}</span>
                              {bucket === 'depleted' && <Chip tone="danger">{t('depleted')}</Chip>}
                              {bucket === 'expiring' && <Chip tone="warning">{t('depletingSoon')}</Chip>}
                              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <Tooltip content={t('pages.clients.clientInfo')}>
                                  <button
                                    type="button"
                                    aria-label={t('pages.clients.clientInfo')}
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => onShowInfo(row)}
                                  >
                                    <Info className="h-[18px] w-[18px]" aria-hidden />
                                  </button>
                                </Tooltip>
                                <Switch
                                  checked={!!row.enable}
                                  disabled={togglingEmail === row.email}
                                  onCheckedChange={(next) => onToggleEnable(row, next)}
                                  aria-label={t('pages.clients.enabled')}
                                />
                                <DropdownMenu
                                  align="end"
                                  label={t('more')}
                                  items={[
                                      { key: 'qr', icon: <QrCode className="h-4 w-4" />, label: t('pages.clients.qrCode'), onSelect: () => onShowQr(row) },
                                      { key: 'reset', icon: <Repeat className="h-4 w-4" />, label: t('pages.inbounds.resetTraffic'), onSelect: () => onResetTraffic(row) },
                                      { key: 'edit', icon: <Pencil className="h-4 w-4" />, label: t('edit'), onSelect: () => onEdit(row) },
                                      { key: 'delete', icon: <Trash2 className="h-4 w-4" />, label: t('delete'), danger: true, onSelect: () => onDelete(row) }
                                  ]}
                                />
                              </div>
                            </div>
                          </div>
                          );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            )}

        <LazyMount when={formOpen}>
          <ClientFormModal
            open={formOpen}
            mode={formMode}
            client={editingClient}
            attachedIds={editingAttachedIds}
            inbounds={inbounds}
            ipLimitEnable={ipLimitEnable}
            tgBotEnable={tgBotEnable}
            groups={allGroups}
            save={onSave}
            onOpenChange={setFormOpen}
          />
        </LazyMount>
        <LazyMount when={infoOpen}>
          <ClientInfoModal
            open={infoOpen}
            client={infoClient}
            inboundsById={inboundsById}
            isOnline={infoClient ? isOnline(infoClient.email) : false}
            subSettings={subSettings}
            onOpenChange={setInfoOpen}
          />
        </LazyMount>
        <LazyMount when={qrOpen}>
          <ClientQrModal
            open={qrOpen}
            client={qrClient}
            subSettings={subSettings}
            onOpenChange={setQrOpen}
          />
        </LazyMount>
        <LazyMount when={bulkAddOpen}>
          <ClientBulkAddModal
            open={bulkAddOpen}
            inbounds={inbounds}
            ipLimitEnable={ipLimitEnable}
            groups={allGroups}
            onOpenChange={setBulkAddOpen}
            onSaved={() => setBulkAddOpen(false)}
          />
        </LazyMount>
        <LazyMount when={bulkAdjustOpen}>
          <ClientBulkAdjustModal
            open={bulkAdjustOpen}
            count={selectedRowKeys.length}
            onOpenChange={setBulkAdjustOpen}
            onSubmit={async (addDays, addBytes) =>
            {
                const msg = await bulkAdjust([...selectedRowKeys], addDays, addBytes);
                if (msg?.success)
                {
                    setSelectedRowKeys([]);
                    return msg.obj ?? { adjusted: 0 };
                }
                return null;
            }}
          />
        </LazyMount>
        <LazyMount when={subLinksOpen}>
          <SubLinksModal
            open={subLinksOpen}
            emails={selectedRowKeys}
            clients={clients}
            subSettings={subSettings}
            onOpenChange={setSubLinksOpen}
          />
        </LazyMount>
        <LazyMount when={bulkGroupOpen}>
          <BulkAddToGroupModal
            open={bulkGroupOpen}
            count={selectedRowKeys.length}
            groups={allGroups}
            onOpenChange={setBulkGroupOpen}
            onSubmit={async (group) =>
            {
                const msg = await bulkAddToGroup([...selectedRowKeys], group);
                if (msg?.success)
                {
                    setSelectedRowKeys([]);
                    return (msg.obj as { affected?: number } | undefined) ?? { affected: 0 };
                }
                return null;
            }}
          />
        </LazyMount>
        <LazyMount when={bulkAttachOpen}>
          <BulkAttachInboundsModal
            open={bulkAttachOpen}
            count={selectedRowKeys.length}
            inbounds={inbounds}
            onOpenChange={setBulkAttachOpen}
            onSubmit={async (inboundIds) =>
            {
                const msg = await bulkAttach([...selectedRowKeys], inboundIds);
                if (msg?.success)
                {
                    setSelectedRowKeys([]);
                    return msg.obj ?? { attached: [], skipped: [], errors: [] };
                }
                return null;
            }}
          />
        </LazyMount>
        <LazyMount when={bulkDetachOpen}>
          <BulkDetachInboundsModal
            open={bulkDetachOpen}
            count={selectedRowKeys.length}
            inbounds={inbounds}
            onOpenChange={setBulkDetachOpen}
            onSubmit={async (inboundIds) =>
            {
                const msg = await bulkDetach([...selectedRowKeys], inboundIds);
                if (msg?.success)
                {
                    setSelectedRowKeys([]);
                    return msg.obj ?? { detached: [], skipped: [], errors: [] };
                }
                return null;
            }}
          />
        </LazyMount>
        <LazyMount when={filterDrawerOpen}>
          <FilterDrawer
            open={filterDrawerOpen}
            onOpenChange={setFilterDrawerOpen}
            filters={filters}
            onChange={setFilters}
            inbounds={inbounds}
            protocols={protocolOptions}
            groups={groupOptions}
          />
        </LazyMount>
    </PageShell>
    );
}

// A dismissible filter chip with a close button.
function RemovableChip({
    children,
    tone = 'neutral',
    onRemove
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warning';
  onRemove: () => void;
})
{
    const toneClass = {
        neutral: 'bg-surface text-foreground border border-border',
        accent: 'bg-accent-subtle text-accent',
        warning: 'bg-warning-subtle text-warning'
    }[tone];
    return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', toneClass)}>
      {children}
      <button
        type="button"
        aria-label="remove"
        onClick={onRemove}
        className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-foreground/10"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
    );
}

// Server-side pagination controls (the DS Table paginates client-side, which we
// disable with pageSize=0; counts/pages come from the server).
function PaginationBar({
    page,
    pageCount,
    pageSize,
    total,
    rangeFrom,
    rangeTo,
    onPage,
    onPageSize,
    compact
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  rangeFrom: number;
  rangeTo: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  compact?: boolean;
})
{
    return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
      <span className="text-xs tabular-nums text-muted-foreground">
        {rangeFrom}–{rangeTo} / {total}
      </span>
      <div className="flex items-center gap-2">
        {total > 10 && !compact && (
          <Select
            value={String(pageSize)}
            className="min-w-[88px]"
            onChange={(v) => onPageSize(Number(v))}
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">{page} / {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </button>
        </div>
      </div>
    </div>
    );
}

function bucketChipLabel(b: string, t: (k: string) => string): string
{
    switch (b)
    {
        case 'active': return t('subscription.active');
        case 'expiring': return t('depletingSoon');
        case 'depleted': return t('depleted');
        case 'deactive': return t('disabled');
        case 'online': return t('online');
        default: return b;
    }
}
