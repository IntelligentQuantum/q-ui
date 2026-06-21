import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import { Button, Card, ErrorState, Input, Label, PasswordInput, Spinner, Switch } from '@/components/ui';
// Reused as-is: the bank-card manager hits /billing/admin/payment-cards, which is
// tenant-scoped server-side, so a manager edits ONLY their own workspace's cards.
import ManualDepositTab from '@/pages/settings/ManualDepositTab';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface PaymentSettings {
  zarinpalEnable: boolean;
  zarinpalMerchantId: string;
  zarinpalSandbox: boolean;
  zarinpalCurrency: string;
  plisioEnable: boolean;
  plisioSecretKey: string;
}

const DEFAULTS: PaymentSettings = {
    zarinpalEnable: false, zarinpalMerchantId: '', zarinpalSandbox: false,
    zarinpalCurrency: 'IRT', plisioEnable: false, plisioSecretKey: ''
};

async function fetchSettings(): Promise<PaymentSettings>
{
    const msg = await HttpUtil.get('/panel/api/tenant/payments', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load payment settings');
    }
    return { ...DEFAULTS, ...(msg.obj as Partial<PaymentSettings>) };
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode })
{
    return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
    );
}

export default function WorkspacePaymentsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const query = useQuery({ queryKey: ['tenant', 'payments'], queryFn: fetchSettings });
    const [draft, setDraft] = useState<PaymentSettings | null>(null);
    useEffect(() =>
    {
        if (query.data)
        {
            setDraft(query.data);
        }
    }, [query.data]);

    const saveMut = useMutation({
        mutationFn: (v: PaymentSettings) => HttpUtil.post('/panel/api/tenant/payments', v, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                queryClient.invalidateQueries({ queryKey: ['tenant', 'payments'] });
                // Gateway availability flows to the SPA via /me.
                queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
                messageApi.success(t('pages.workspacePayments.toasts.saved'));
            }
        }
    });

    const set = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) =>
        setDraft((d) => (d ? { ...d, [k]: v } : d));

    // Guard: enabling a gateway with no credential is a silent no-op server-side
    // (an empty merchant id / secret key reads as "disabled"), so the switch would
    // claim to be on while the gateway is off. Block the save and tell the manager.
    const save = () =>
    {
        if (!draft)
        {
            return;
        }
        if (draft.zarinpalEnable && !draft.zarinpalMerchantId.trim())
        {
            messageApi.error(t('pages.workspacePayments.toasts.merchantRequired'));
            return;
        }
        if (draft.plisioEnable && !draft.plisioSecretKey.trim())
        {
            messageApi.error(t('pages.workspacePayments.toasts.secretRequired'));
            return;
        }
        saveMut.mutateAsync(draft);
    };

    if (query.isLoading || !draft)
    {
        return (
      <PageShell name="workspace-payments-page">
        <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
      </PageShell>
        );
    }
    if (query.isError)
    {
        return (
      <PageShell name="workspace-payments-page">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </PageShell>
        );
    }

    return (
    <PageShell
      name="workspace-payments-page"
      actions={
        <Button onClick={save} loading={saveMut.isPending}>
          <Save className="h-4 w-4" aria-hidden />
          {t('save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspacePayments.zarinpal')}</h2>
          <Row label={t('pages.workspacePayments.enable')}>
            <Switch checked={draft.zarinpalEnable} onCheckedChange={(v) => set('zarinpalEnable', v)} aria-label={t('pages.workspacePayments.enable')} />
          </Row>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zp-merchant">{t('pages.workspacePayments.zarinpalMerchant')}</Label>
            <Input id="zp-merchant" value={draft.zarinpalMerchantId} onChange={(e) => set('zarinpalMerchantId', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zp-currency">{t('pages.workspacePayments.zarinpalCurrency')}</Label>
            <Input id="zp-currency" value={draft.zarinpalCurrency} onChange={(e) => set('zarinpalCurrency', e.target.value)} placeholder="IRT" />
          </div>
          <Row label={t('pages.workspacePayments.sandbox')}>
            <Switch checked={draft.zarinpalSandbox} onCheckedChange={(v) => set('zarinpalSandbox', v)} aria-label={t('pages.workspacePayments.sandbox')} />
          </Row>
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspacePayments.plisio')}</h2>
          <Row label={t('pages.workspacePayments.enable')}>
            <Switch checked={draft.plisioEnable} onCheckedChange={(v) => set('plisioEnable', v)} aria-label={t('pages.workspacePayments.enable')} />
          </Row>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-secret">{t('pages.workspacePayments.plisioSecret')}</Label>
            <PasswordInput id="pl-secret" autoComplete="off" value={draft.plisioSecretKey} onChange={(e) => set('plisioSecretKey', e.target.value)} />
          </div>
        </Card>

        {/* Manual (card-to-card) deposit: the workspace's own bank cards buyers
            transfer to. Self-contained (its own save), tenant-scoped server-side. */}
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <ManualDepositTab />
        </Card>
      </div>
    </PageShell>
    );
}
