import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Receipt, X } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil, IntlUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Button,
    Card,
    CardContent,
    Label,
    Modal,
    SearchInput,
    Select,
    Table,
    Textarea,
    Tooltip,
    confirm
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface DepositView {
  id: number;
  userId: number;
  username: string;
  role: string;
  amount: number;
  description: string;
  receiptImage: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string;
  approvedBy: number;
  approvedAt: number;
  createdAt: number;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
};

function receiptUrl(id: number): string
{
    return `${ window.Q_UI_BASE_PATH || '/' }panel/api/billing/deposits/${ id }/receipt`.replace(/\/{2,}/g, '/');
}

export default function ManualDepositsPage()
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

    const [statusFilter, setStatusFilter] = useState('pending');
    const [search, setSearch] = useState('');

    const depositsQuery = useQuery({
        queryKey: ['admin', 'deposits', statusFilter, search],
        queryFn: async () =>
        {
            const params = new URLSearchParams();
            params.set('limit', '500');
            if (statusFilter !== 'all')
            {
                params.set('status', statusFilter);
            }
            if (search.trim())
            {
                params.set('search', search.trim());
            }
            const msg = await HttpUtil.get(`/panel/api/billing/admin/deposits?${ params.toString() }`, undefined, { silent: true });
            return msg?.success ? ((msg.obj as DepositView[]) ?? []) : [];
        }
    });

    const invalidateDeposits = () => queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });

    const approveMut = useMutation({
        mutationFn: (id: number) => HttpUtil.post(`/panel/api/billing/admin/deposits/${ id }/approve`, {}, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                messageApi.success(t('pages.adminDeposits.toasts.approved'));
                invalidateDeposits();
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    const [rejectTarget, setRejectTarget] = useState<DepositView | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const rejectMut = useMutation({
        mutationFn: (payload: { id: number; reason: string }) =>
            HttpUtil.post(`/panel/api/billing/admin/deposits/${ payload.id }/reject`, { reason: payload.reason }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                messageApi.success(t('pages.adminDeposits.toasts.rejected'));
                setRejectTarget(null);
                setRejectReason('');
                invalidateDeposits();
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    const [detail, setDetail] = useState<DepositView | null>(null);

    async function onApprove(row: DepositView)
    {
        const ok = await confirm({
            title: t('pages.adminDeposits.approveConfirmTitle'),
            description: t('pages.adminDeposits.approveConfirmContent', { amount: formatMoney(row.amount), user: row.username }),
            confirmText: t('pages.adminDeposits.approve')
        });
        if (!ok)
        {
            return;
        }
        approveMut.mutate(row.id);
    }

    function submitReject()
    {
        if (!rejectReason.trim())
        {
            messageApi.error(t('pages.adminDeposits.toasts.reasonRequired'));
            return;
        }
        if (rejectTarget)
        {
            rejectMut.mutate({ id: rejectTarget.id, reason: rejectReason.trim() });
        }
    }

    const statusOptions = useMemo(
        () => [
            { value: 'all', label: t('all') },
            { value: 'pending', label: t('pages.adminDeposits.pending') },
            { value: 'approved', label: t('pages.adminDeposits.approved') },
            { value: 'rejected', label: t('pages.adminDeposits.rejected') }
        ],
        [t]
    );

    const columns: Column<DepositView>[] = [
        {
            key: 'user',
            header: t('pages.adminDeposits.user'),
            cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.username || `#${ row.userId }`}</span>
          <span className="text-xs text-muted-foreground capitalize">{row.role}</span>
        </div>
            )
        },
        {
            key: 'amount',
            header: t('pages.adminDeposits.amount'),
            accessor: (row) => row.amount,
            sortable: true,
            cell: (row) => <strong className="tabular-nums">{formatMoney(row.amount)}</strong>
        },
        {
            key: 'receipt',
            header: t('pages.adminDeposits.receipt'),
            className: 'hidden lg:table-cell',
            cell: (row) => row.receiptImage
                ? (
            <a className="inline-flex items-center gap-1 text-sm text-accent hover:underline" href={receiptUrl(row.id)} target="_blank" rel="noreferrer">
              <Receipt className="h-4 w-4" aria-hidden /> {t('pages.adminDeposits.viewReceipt')}
            </a>
                )
                : <span className="text-muted-foreground">{t('pages.adminDeposits.noReceipt')}</span>
        },
        {
            key: 'status',
            header: t('pages.adminDeposits.status'),
            cell: (row) => (
        <Badge variant={STATUS_BADGE[row.status] ?? 'neutral'}>
          {t(`pages.adminDeposits.status_${ row.status }`, { defaultValue: row.status })}
        </Badge>
            )
        },
        {
            key: 'createdAt',
            header: t('pages.adminDeposits.createdAt'),
            className: 'hidden sm:table-cell',
            cell: (row) => IntlUtil.formatDate(row.createdAt)
        },
        {
            key: 'actions',
            header: t('pages.adminDeposits.actions'),
            width: 150,
            cell: (row) => (
        <div className="flex items-center gap-0.5">
          <Tooltip content={t('pages.adminDeposits.viewDetails')}>
            <Button variant="ghost" size="icon" aria-label={t('pages.adminDeposits.viewDetails')} onClick={() => setDetail(row)}>
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
          {row.status === 'pending' && (
            <>
              <Tooltip content={t('pages.adminDeposits.approve')}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('pages.adminDeposits.approve')}
                  loading={approveMut.isPending && approveMut.variables === row.id}
                  onClick={() => onApprove(row)}
                >
                  <Check className="h-4 w-4 text-success" aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content={t('pages.adminDeposits.reject')}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('pages.adminDeposits.reject')}
                  onClick={() =>
                  {
                      setRejectTarget(row);
                      setRejectReason('');
                  }}
                >
                  <X className="h-4 w-4 text-danger" aria-hidden />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
            )
        }
    ];

    return (
    <PageShell title={t('pages.adminDeposits.title')} description={t('pages.adminDeposits.subtitle')}>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-48">
              <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} aria-label={t('pages.adminDeposits.filterStatus')} />
            </div>
            <div className="w-full sm:w-72">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pages.adminDeposits.searchPlaceholder')}
              />
            </div>
          </div>
          <Table<DepositView>
            columns={columns}
            data={depositsQuery.data ?? []}
            rowKey={(row) => String(row.id)}
            loading={depositsQuery.isFetching}
            pageSize={10}
            empty={<div className="py-6 text-center text-muted-foreground">{t('pages.adminDeposits.empty')}</div>}
          />
        </CardContent>
      </Card>

      {/* Reject modal */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={t('pages.adminDeposits.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>{t('cancel')}</Button>
            <Button variant="danger" loading={rejectMut.isPending} onClick={submitReject}>{t('pages.adminDeposits.reject')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">{t('pages.adminDeposits.rejectReason')}</Label>
          <Textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t('pages.adminDeposits.rejectReasonPlaceholder')}
          />
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t('pages.adminDeposits.details')}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>{t('close')}</Button>}
      >
        {detail && (
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('pages.adminDeposits.user')}</dt>
            <dd className="col-span-2">{detail.username} <span className="text-muted-foreground capitalize">({detail.role})</span></dd>
            <dt className="text-muted-foreground">{t('pages.adminDeposits.amount')}</dt>
            <dd className="col-span-2 font-semibold">{formatMoney(detail.amount)}</dd>
            <dt className="text-muted-foreground">{t('pages.manualDeposit.descriptionLabel')}</dt>
            <dd className="col-span-2 whitespace-pre-wrap break-words">{detail.description || '—'}</dd>
            <dt className="text-muted-foreground">{t('pages.adminDeposits.status')}</dt>
            <dd className="col-span-2">
              <Badge variant={STATUS_BADGE[detail.status] ?? 'neutral'}>
                {t(`pages.adminDeposits.status_${ detail.status }`, { defaultValue: detail.status })}
              </Badge>
            </dd>
            {detail.status === 'rejected' && detail.rejectionReason && (
              <>
                <dt className="text-muted-foreground">{t('pages.manualDeposit.rejectionReason')}</dt>
                <dd className="col-span-2 text-danger">{detail.rejectionReason}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t('pages.adminDeposits.createdAt')}</dt>
            <dd className="col-span-2">{IntlUtil.formatDate(detail.createdAt)}</dd>
            {detail.receiptImage && (
              <>
                <dt className="text-muted-foreground">{t('pages.adminDeposits.receipt')}</dt>
                <dd className="col-span-2">
                  <a className="inline-flex items-center gap-1 text-accent hover:underline" href={receiptUrl(detail.id)} target="_blank" rel="noreferrer">
                    <Receipt className="h-4 w-4" aria-hidden /> {t('pages.adminDeposits.viewReceipt')}
                  </a>
                </dd>
              </>
            )}
          </dl>
        )}
      </Modal>
    </PageShell>
    );
}
