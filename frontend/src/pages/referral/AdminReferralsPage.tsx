import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import { Badge, Button, Card, CardContent, Input, Label, Modal, SearchInput, Select, Spinner, Switch, Table } from '@/components/ui';
import type { Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface Reseller {
  id: number;
  username: string;
  code: string;
  enabled: boolean;
  totalReferrals: number;
  purchasedUsers: number;
  revenue: number;
}

// AdminReferralsPage is the admin-only control plane for reseller referral codes:
// set/edit a code, enable/disable it, and see each reseller's headline stats. The
// backend endpoints (/referral/resellers, /referral/code, /referral/enabled) are
// all RequireAdmin.
export default function AdminReferralsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { format: money } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ['referral', 'resellers'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/referral/resellers', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Reseller[]) ?? []) : [];
        }
    });

    // Client-side search + status filter (the roster is small and already loaded).
    const resellers = useMemo(() => query.data ?? [], [query.data]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const filtered = useMemo(() =>
    {
        const needle = search.trim().toLowerCase();
        return resellers.filter((r) =>
        {
            if (statusFilter === 'enabled' && !r.enabled)
            {
                return false;
            }
            if (statusFilter === 'disabled' && r.enabled)
            {
                return false;
            }
            if (!needle)
            {
                return true;
            }
            return [r.username, r.code].some((v) => (v || '').toLowerCase().includes(needle));
        });
    }, [resellers, search, statusFilter]);

    const [editing, setEditing] = useState<Reseller | null>(null);
    const [code, setCode] = useState('');

    const codeMut = useMutation({
        mutationFn: (v: { userId: number; code: string }) => HttpUtil.post('/panel/api/referral/code', v, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                setEditing(null);
                qc.invalidateQueries({ queryKey: ['referral', 'resellers'] });
                messageApi.success(t('pages.adminReferrals.toasts.codeSaved'));
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    const enabledMut = useMutation({
        mutationFn: (v: { userId: number; enabled: boolean }) => HttpUtil.post('/panel/api/referral/enabled', v, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                qc.invalidateQueries({ queryKey: ['referral', 'resellers'] });
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    function openEdit(r: Reseller)
    {
        setEditing(r);
        setCode(r.code);
    }

    const columns: Column<Reseller>[] = [
        { key: 'username', header: t('username'), cell: (r) => <span className="font-medium">{r.username}</span> },
        {
            key: 'code',
            header: t('pages.adminReferrals.code'),
            cell: (r) => (
        <span className="flex items-center gap-2">
          {r.code
              ? <Badge variant="primary" className="font-mono">{r.code}</Badge>
              : <span className="text-muted-foreground">—</span>}
          <Button variant="ghost" size="icon" aria-label={t('pages.adminReferrals.editCode')} onClick={() => openEdit(r)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
            )
        },
        {
            key: 'enabled',
            header: t('pages.adminReferrals.enabled'),
            cell: (r) => (
        <Switch
          checked={r.enabled}
          onCheckedChange={(v) => enabledMut.mutate({ userId: r.id, enabled: v })}
          aria-label={t('pages.adminReferrals.enabled')}
        />
            )
        },
        { key: 'referrals', header: t('pages.adminReferrals.referrals'), cell: (r) => <span className="tabular-nums">{r.totalReferrals}</span> },
        { key: 'purchased', header: t('pages.adminReferrals.purchased'), className: 'hidden sm:table-cell', cell: (r) => <span className="tabular-nums">{r.purchasedUsers}</span> },
        { key: 'revenue', header: t('pages.adminReferrals.revenue'), cell: (r) => <span className="tabular-nums">{money(r.revenue)}</span> }
    ];

    if (query.isLoading)
    {
        return (
      <PageShell title={t('pages.adminReferrals.title')}>
        <div className="flex min-h-[30vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>
      </PageShell>
        );
    }

    return (
    <PageShell title={t('pages.adminReferrals.title')} description={t('pages.adminReferrals.subtitle')}>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <Select
              className="w-full sm:w-44"
              aria-label={t('filter')}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                  { value: 'all', label: t('all') },
                  { value: 'enabled', label: t('pages.adminReferrals.enabled') },
                  { value: 'disabled', label: t('disabled') }
              ]}
            />
            <SearchInput
              className="w-full max-w-[280px] sm:w-auto"
              aria-label={t('pages.adminReferrals.searchPlaceholder')}
              placeholder={t('pages.adminReferrals.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Table<Reseller>
            columns={columns}
            data={filtered}
            rowKey={(r) => String(r.id)}
            loading={query.isFetching}
            pageSize={10}
            empty={<div className="py-10 text-center text-muted-foreground">{t('pages.adminReferrals.empty')}</div>}
          />
        </CardContent>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? t('pages.adminReferrals.editTitle', { name: editing.username }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
            <Button onClick={() => editing && codeMut.mutateAsync({ userId: editing.id, code })} loading={codeMut.isPending}>{t('save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ref-code">{t('pages.adminReferrals.code')}</Label>
          <Input id="ref-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ARASH123" dir="ltr" />
          <span className="text-xs text-muted-foreground">{t('pages.adminReferrals.codeHint')}</span>
        </div>
      </Modal>
    </PageShell>
    );
}
