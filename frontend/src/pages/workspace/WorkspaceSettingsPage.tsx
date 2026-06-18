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
import { Button, Card, ErrorState, Input, Label, Select, Spinner, Switch } from '@/components/ui';
// Reused as-is: the ticket-category manager hits /tickets/admin/categories, which
// is tenant-scoped, so a manager edits ONLY their own workspace's categories.
import TicketCategoriesTab from '@/pages/settings/TicketCategoriesTab';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface WorkspaceSettings {
  slug: string;
  brandTitle: string;
  brandLogo: string;
  brandFavicon: string;
  theme: string;
  registrationEnable: boolean;
  subTitle: string;
}

const DEFAULTS: WorkspaceSettings = {
    slug: '', brandTitle: '', brandLogo: '', brandFavicon: '', theme: 'system', registrationEnable: false, subTitle: ''
};

async function fetchSettings(): Promise<WorkspaceSettings>
{
    const msg = await HttpUtil.get('/panel/api/tenant/settings', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load workspace settings');
    }
    return { ...DEFAULTS, ...(msg.obj as Partial<WorkspaceSettings>) };
}

function Field({ label, htmlFor, hint, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode })
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
    );
}

export default function WorkspaceSettingsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const query = useQuery({ queryKey: ['tenant', 'settings'], queryFn: fetchSettings });
    const [draft, setDraft] = useState<WorkspaceSettings | null>(null);
    useEffect(() =>
    {
        if (query.data)
        {
            setDraft(query.data);
        }
    }, [query.data]);

    const saveMut = useMutation({
        mutationFn: (v: WorkspaceSettings) => HttpUtil.post('/panel/api/tenant/settings', v, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] });
                // Branding (title) surfaces via /me; refresh it so the shell updates.
                queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
                messageApi.success(t('pages.workspaceSettings.toasts.saved'));
            }
        }
    });

    const set = <K extends keyof WorkspaceSettings>(k: K, v: WorkspaceSettings[K]) =>
        setDraft((d) => (d ? { ...d, [k]: v } : d));

    if (query.isLoading || !draft)
    {
        return (
      <PageShell name="workspace-settings-page">
        <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
      </PageShell>
        );
    }
    if (query.isError)
    {
        return (
      <PageShell name="workspace-settings-page">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </PageShell>
        );
    }

    return (
    <PageShell
      name="workspace-settings-page"
      actions={
        <Button onClick={() => saveMut.mutateAsync(draft)} loading={saveMut.isPending}>
          <Save className="h-4 w-4" aria-hidden />
          {t('save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspaceSettings.workspaceUrl')}</h2>
          <Field label={t('pages.workspaceSettings.slug')} htmlFor="ws-slug" hint={t('pages.workspaceSettings.slugHint')}>
            <Input id="ws-slug" value={draft.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="hamed" />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspaceSettings.branding')}</h2>
          <Field label={t('pages.workspaceSettings.brandTitle')} htmlFor="ws-title">
            <Input id="ws-title" value={draft.brandTitle} maxLength={60} onChange={(e) => set('brandTitle', e.target.value)} />
          </Field>
          <Field label={t('pages.workspaceSettings.brandLogo')} htmlFor="ws-logo" hint={t('pages.workspaceSettings.urlHint')}>
            <Input id="ws-logo" value={draft.brandLogo} onChange={(e) => set('brandLogo', e.target.value)} placeholder="https://…/logo.svg" />
          </Field>
          <Field label={t('pages.workspaceSettings.brandFavicon')} htmlFor="ws-favicon" hint={t('pages.workspaceSettings.urlHint')}>
            <Input id="ws-favicon" value={draft.brandFavicon} onChange={(e) => set('brandFavicon', e.target.value)} placeholder="https://…/favicon.ico" />
          </Field>
          <Field label={t('pages.workspaceSettings.theme')} htmlFor="ws-theme">
            <Select
              id="ws-theme"
              value={draft.theme}
              onChange={(v) => set('theme', v)}
              options={[
                  { value: 'system', label: t('pages.workspaceSettings.themeSystem') },
                  { value: 'light', label: t('pages.workspaceSettings.themeLight') },
                  { value: 'dark', label: t('pages.workspaceSettings.themeDark') }
              ]}
            />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspaceSettings.access')}</h2>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <Label htmlFor="ws-reg">{t('pages.workspaceSettings.registrationEnable')}</Label>
              <span className="text-xs text-muted-foreground">{t('pages.workspaceSettings.registrationHint')}</span>
            </div>
            <Switch id="ws-reg" checked={draft.registrationEnable} onCheckedChange={(v) => set('registrationEnable', v)} aria-label={t('pages.workspaceSettings.registrationEnable')} />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspaceSettings.subscription')}</h2>
          <Field label={t('pages.workspaceSettings.subTitle')} htmlFor="ws-sub" hint={t('pages.workspaceSettings.subTitleHint')}>
            <Input id="ws-sub" value={draft.subTitle} onChange={(e) => set('subTitle', e.target.value)} />
          </Field>
        </Card>

        {/* The workspace's own support ticket categories. Self-contained (its own
            create/edit/save), tenant-scoped server-side. */}
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('pages.workspaceSettings.ticketCategories')}</h2>
          <TicketCategoriesTab />
        </Card>
      </div>
    </PageShell>
    );
}
