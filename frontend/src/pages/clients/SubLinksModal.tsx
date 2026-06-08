import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { Copy, Download } from 'lucide-react';

import { Alert, Button, Modal, Tooltip, cn } from '@/components/ui';
import type { ClientRecord } from '@/hooks/useClients';

interface SubSettings {
  enable: boolean;
  subURI: string;
  subJsonURI: string;
  subJsonEnable: boolean;
}

interface SubLinksModalProps {
  open: boolean;
  emails: string[];
  clients: ClientRecord[];
  subSettings?: SubSettings;
  onOpenChange: (open: boolean) => void;
}

interface Row {
  key: string;
  email: string;
  subId: string;
  link: string;
  jsonLink: string;
}

const TH = 'whitespace-nowrap px-3 py-2 text-start font-medium text-muted-foreground';
const TD = 'px-3 py-2 text-foreground';

export default function SubLinksModal({
    open,
    emails,
    clients,
    subSettings,
    onOpenChange
}: SubLinksModalProps)
{
    const { t } = useTranslation();
    const [messageApi, messageContextHolder] = message.useMessage();

    const enabled = !!subSettings?.enable && !!subSettings?.subURI;
    const jsonEnabled = !!subSettings?.subJsonEnable && !!subSettings?.subJsonURI;

    const rows = useMemo<Row[]>(() =>
    {
        if (!enabled)
        {
            return [];
        }
        const byEmail = new Map(clients.map((c) => [c.email, c]));
        const out: Row[] = [];
        for (const email of emails)
        {
            const c = byEmail.get(email);
            if (!c?.subId)
            {
                continue;
            }
            out.push({
                key: email,
                email,
                subId: c.subId,
                link: subSettings!.subURI + c.subId,
                jsonLink: jsonEnabled ? subSettings!.subJsonURI + c.subId : ''
            });
        }
        return out;
    }, [emails, clients, enabled, jsonEnabled, subSettings]);

    const allText = useMemo(
        () => rows.map((r) => (jsonEnabled ? `${ r.email }\t${ r.link }\t${ r.jsonLink }` : `${ r.email }\t${ r.link }`)).join('\n'),
        [rows, jsonEnabled]
    );

    async function copy(text: string, label?: string)
    {
        try
        {
            await navigator.clipboard.writeText(text);
            messageApi.success(label || t('copied'));
        }
        catch
        {
            messageApi.error(t('somethingWentWrong'));
        }
    }

    function download()
    {
        const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `sub-links-${ stamp }.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    return (
    <>
      {messageContextHolder}
      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        size="xl"
        title={t('pages.clients.subLinksTitle', { count: rows.length })}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('close')}</Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={rows.length === 0}
                onClick={() => copy(allText, t('pages.clients.subLinksCopiedAll', { count: rows.length }))}
              >
                <Copy className="h-4 w-4" aria-hidden />
                {t('pages.clients.subLinksCopyAll')}
              </Button>
              <Button
                variant="primary"
                disabled={rows.length === 0}
                onClick={download}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t('download')}
              </Button>
            </div>
          </div>
        }
      >
        {!enabled && (
          <Alert variant="warning" title={t('pages.clients.subLinksDisabled')} className="mb-3">
            {t('pages.clients.subLinksDisabledHint')}
          </Alert>
        )}
        {enabled && rows.length === 0 && (
          <Alert variant="info" className="mb-3">
            {t('pages.clients.subLinksEmpty')}
          </Alert>
        )}
        {rows.length > 0 && (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-sunken">
                  <th className={cn(TH, 'w-[180px]')}>{t('pages.clients.client')}</th>
                  <th className={TH}>{t('pages.clients.subLinkColumn')}</th>
                  {jsonEnabled && <th className={TH}>{t('pages.clients.subJsonLinkColumn')}</th>}
                  <th className={cn(TH, 'w-16')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className={cn(TD, 'max-w-[180px] truncate')} title={row.email}>{row.email}</td>
                    <td className={cn(TD, 'max-w-0')}>
                      <Tooltip content={row.link}>
                        <span className="block truncate">{row.link}</span>
                      </Tooltip>
                    </td>
                    {jsonEnabled && (
                      <td className={cn(TD, 'max-w-0')}>
                        <Tooltip content={row.jsonLink}>
                          <span className="block truncate">{row.jsonLink}</span>
                        </Tooltip>
                      </td>
                    )}
                    <td className={cn(TD, 'text-end')}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={t('copy')}
                        onClick={() => copy(row.link, t('copied'))}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
    );
}
