import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Banknote,
    Check,
    Copy,
    CreditCard,
    Receipt,
    Upload,
    Wallet,
    X
} from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe, ME_QUERY_KEY } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { HttpUtil, IntlUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    SearchInput,
    StatCard,
    Table,
    Textarea,
    cn
} from '@/components/ui';
import type { BadgeVariant, Column } from '@/components/ui';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

interface PaymentCard {
  id: number;
  title: string;
  cardHolderName: string;
  cardNumber: string;
  bankName: string;
  iban: string;
  accountNumber: string;
  status: string;
  displayOrder: number;
}

interface DepositRequest {
  id: number;
  amount: number;
  description: string;
  receiptImage: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string;
  approvedAt: number;
  createdAt: number;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
};

async function fetchCards(): Promise<PaymentCard[]>
{
    const msg = await HttpUtil.get('/panel/api/billing/payment-cards', undefined, { silent: true });
    return msg?.success ? ((msg.obj as PaymentCard[]) ?? []) : [];
}

async function fetchDeposits(): Promise<DepositRequest[]>
{
    const msg = await HttpUtil.get('/panel/api/billing/deposits', undefined, { silent: true });
    return msg?.success ? ((msg.obj as DepositRequest[]) ?? []) : [];
}

// CopyField renders a labelled, copyable value with a one-shot "copied" tick.
function CopyField({ label, value, ariaLabel }: { label: string; value: string; ariaLabel: string })
{
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    if (!value)
    {
        return null;
    }
    const onCopy = async () =>
    {
        try
        {
            await navigator.clipboard.writeText(value.replace(/\s+/g, ''));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
        catch
        {
            /* clipboard unavailable — no-op */
        }
    };
    return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm tabular-nums text-foreground" dir="ltr">{value}</div>
      </div>
      <Button variant="ghost" size="icon" aria-label={ariaLabel} title={t('pages.manualDeposit.copyCardNumber')} onClick={onCopy}>
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </Button>
    </div>
    );
}

export default function ManualDepositPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { me } = useMe();
    const { format: formatMoney, formatNumber, unit } = useCurrency();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const cardsQuery = useQuery({ queryKey: ['deposits', 'cards'], queryFn: fetchCards });
    const depositsQuery = useQuery({ queryKey: ['deposits', 'mine'], queryFn: fetchDeposits });

    const [amount, setAmount] = useState<number>(0);
    const [description, setDescription] = useState('');
    const [receipt, setReceipt] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [historySearch, setHistorySearch] = useState('');

    // Client-side filter over the user's own (small) history: matches the amount
    // or the localized status text.
    const filteredDeposits = useMemo(() =>
    {
        const rows = depositsQuery.data ?? [];
        const q = historySearch.trim().toLowerCase();
        if (!q)
        {
            return rows;
        }
        return rows.filter((r) =>
            String(r.amount).includes(q)
            || t(`pages.manualDeposit.status_${ r.status }`, { defaultValue: r.status }).toLowerCase().includes(q));
    }, [depositsQuery.data, historySearch, t]);

    const submitMut = useMutation({
        mutationFn: () =>
        {
            const fd = new FormData();
            fd.append('amount', String(amount));
            fd.append('description', description);
            if (receipt)
            {
                fd.append('receipt', receipt);
            }
            return HttpUtil.post('/panel/api/billing/deposits', fd, { silent: true });
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                messageApi.success(t('pages.manualDeposit.toasts.submitted'));
                setAmount(0);
                setDescription('');
                setReceipt(null);
                if (fileRef.current)
                {
                    fileRef.current.value = '';
                }
                queryClient.invalidateQueries({ queryKey: ['deposits', 'mine'] });
                queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    function onPickFile(e: React.ChangeEvent<HTMLInputElement>)
    {
        const file = e.target.files?.[0] ?? null;
        if (file && file.size > MAX_RECEIPT_BYTES)
        {
            messageApi.error(t('pages.manualDeposit.toasts.receiptTooLarge'));
            e.target.value = '';
            return;
        }
        setReceipt(file);
    }

    function onSubmit()
    {
        if (!amount || amount <= 0)
        {
            messageApi.error(t('pages.manualDeposit.toasts.invalidAmount'));
            return;
        }		// The receipt image is mandatory; description is optional.
		if (!receipt)
        {
            messageApi.error(t('pages.manualDeposit.toasts.fieldsRequired'));
            return;
        }
        submitMut.mutate();
    }

    const cards = cardsQuery.data ?? [];

    const columns: Column<DepositRequest>[] = [
        {
            key: 'amount',
            header: t('pages.manualDeposit.amount'),
            cell: (row) => <strong className="tabular-nums">{formatMoney(row.amount)}</strong>
        },
        {
            key: 'status',
            header: t('pages.manualDeposit.status'),
            cell: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={STATUS_BADGE[row.status] ?? 'neutral'}>
            {t(`pages.manualDeposit.status_${ row.status }`, { defaultValue: row.status })}
          </Badge>
          {row.status === 'rejected' && row.rejectionReason && (
            <span className="text-xs text-danger">{row.rejectionReason}</span>
          )}
        </div>
            )
        },
        {
            key: 'receipt',
            header: t('pages.manualDeposit.receipt'),
            className: 'hidden md:table-cell',
            cell: (row) => row.receiptImage
                ? (
            <a
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
              href={`${ window.Q_UI_BASE_PATH || '/' }panel/api/billing/deposits/${ row.id }/receipt`.replace(/\/{2,}/g, '/')}
              target="_blank"
              rel="noreferrer"
            >
              <Receipt className="h-4 w-4" aria-hidden /> {t('pages.manualDeposit.viewReceipt')}
            </a>
                )
                : <span className="text-muted-foreground">—</span>
        },
        {
            key: 'submittedAt',
            header: t('pages.manualDeposit.submittedAt'),
            cell: (row) => IntlUtil.formatDate(row.createdAt)
        },
        {
            key: 'approvedAt',
            header: t('pages.manualDeposit.approvedAt'),
            className: 'hidden lg:table-cell',
            cell: (row) => (row.approvedAt ? IntlUtil.formatDate(row.approvedAt) : '—')
        }
    ];

    return (
    <PageShell title={t('pages.manualDeposit.title')} description={t('pages.manualDeposit.subtitle')}>
      <div className="flex w-full flex-col gap-4">
        {/* Balance */}
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden />}
          label={t('balance')}
          value={<>{formatNumber(me?.balance ?? 0)} <span className="text-sm font-medium text-muted-foreground">{unit}</span></>}
        />

        {/* Payment cards */}
        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-accent" aria-hidden />
              {t('pages.manualDeposit.cardsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
            <Alert variant="info">{t('pages.manualDeposit.cardsHint')}</Alert>
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('pages.manualDeposit.noCards')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {cards.map((card) => (
                  <div key={card.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{card.title || card.bankName || t('pages.manualDeposit.cardNumber')}</span>
                      {card.bankName && <Badge variant="primary">{card.bankName}</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('pages.manualDeposit.cardHolder')}: <span className="text-foreground">{card.cardHolderName}</span>
                    </div>
                    <CopyField label={t('pages.manualDeposit.cardNumber')} value={card.cardNumber} ariaLabel={t('pages.manualDeposit.copyCardNumber')} />
                    {card.iban && (
                      <CopyField label={t('pages.manualDeposit.iban')} value={card.iban} ariaLabel={t('pages.manualDeposit.copyIban')} />
                    )}
                    {card.accountNumber && (
                      <CopyField label={t('pages.manualDeposit.accountNumber')} value={card.accountNumber} ariaLabel={t('pages.manualDeposit.copyAccount')} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit form */}
        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-success" aria-hidden />
              {t('pages.manualDeposit.formTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
            <Alert variant="info">{t('pages.manualDeposit.formHint')}</Alert>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dep-amount">{t('pages.manualDeposit.amount')}</Label>
                <div className="flex">
                  <Input
                    id="dep-amount"
                    inputMode="numeric"
                    className={cn('rounded-e-none')}
                    value={amount ? formatNumber(amount) : ''}
                    onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                  />
                  <span className="inline-flex items-center rounded-e-md border border-s-0 border-border bg-surface-sunken px-3 text-sm text-muted-foreground">
                    {unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dep-desc">{t('pages.manualDeposit.descriptionLabel')}</Label>
              <Textarea
                id="dep-desc"
                placeholder={t('pages.manualDeposit.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Receipt upload */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('pages.manualDeposit.receipt')}</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPickFile}
              />
              {receipt ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Receipt className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="truncate">{receipt.name}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('pages.manualDeposit.removeFile')}
                    onClick={() =>
                    {
                        setReceipt(null);
                        if (fileRef.current)
                        {
                            fileRef.current.value = '';
                        }
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" className="w-fit" onClick={() => fileRef.current?.click()}>
                  <Upload className="me-2 h-4 w-4" aria-hidden /> {t('pages.manualDeposit.chooseFile')}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{t('pages.manualDeposit.receiptHint')}</span>
            </div>

            <Button className="w-fit" loading={submitMut.isPending} onClick={onSubmit}>
              {t('pages.manualDeposit.submit')}
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 p-4 sm:p-5">
            <CardTitle>{t('pages.manualDeposit.historyTitle')}</CardTitle>
            <SearchInput
              className="w-full max-w-[16rem]"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder={t('search')}
            />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <Table<DepositRequest>
              columns={columns}
              data={filteredDeposits}
              rowKey={(row) => String(row.id)}
              loading={depositsQuery.isFetching}
              pageSize={10}
              empty={<div className="py-6 text-center text-muted-foreground">{t('pages.manualDeposit.empty')}</div>}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
    );
}
