import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle2,
    Copy,
    Download,
    ExternalLink,
    Link2,
    QrCode,
    RefreshCw
} from 'lucide-react';

import { HttpUtil, ClipboardManager } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { parseLinkParts } from '@/lib/xray/link-label';
import { Alert, Badge, Button, Input, Modal, QRCode, Skeleton } from '@/components/ui';

export interface PurchaseSubscription {
  email: string;
  subId: string;
  subUrl: string;
  links: string[];
  partial: boolean;
}

export interface SubscriptionSummary {
  name: string;
  active: boolean;
  trafficLabel: string;
  expiryLabel: string;
}

interface SubscriptionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  // Initial details. When `links` is empty but `email` is set, the modal fetches
  // them on open (the Services "view details" path). When pre-filled by the
  // purchase response (Store), no fetch happens.
  subscription: PurchaseSubscription | null;
  summary: SubscriptionSummary | null;
  title?: ReactNode;
  subtitle?: ReactNode;
}

function downloadQr(svg: SVGElement | null, filename: string)
{
    if (!svg)
    {
        return;
    }
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// A copy-able value with an inline, toggleable QR (view + SVG download).
function QrToggle({ value, label }: { value: string; label: string })
{
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const hostRef = useRef<HTMLDivElement>(null);
    return (
    <>
      <Button variant="ghost" size="icon" aria-label={t('pages.store.success.qr')} onClick={() => setOpen((v) => !v)}>
        <QrCode className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <div className="mt-2 flex w-full basis-full flex-col items-center gap-2 rounded-lg border border-border bg-surface-sunken p-3">
          <div ref={hostRef} className="rounded-md bg-white p-2">
            <QRCode value={value} size={168} errorLevel="M" />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadQr(hostRef.current?.querySelector('svg') ?? null, `${ label || 'qr' }.svg`)}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('pages.store.success.downloadQr')}
          </Button>
        </div>
      )}
    </>
    );
}

async function copy(value: string, okMsg: string)
{
    if (await ClipboardManager.copyText(value))
    {
        getMessage().success(okMsg);
    }
}

export default function SubscriptionDetailsModal({
    open,
    onClose,
    subscription,
    summary,
    title,
    subtitle
}: SubscriptionDetailsModalProps)
{
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [links, setLinks] = useState<string[]>([]);
    const [subUrl, setSubUrl] = useState('');
    const [partial, setPartial] = useState(false);
    const [loading, setLoading] = useState(false);

    const email = subscription?.email ?? '';

    const fetchDetails = async (showError: boolean) =>
    {
        if (!email)
        {
            return;
        }
        setLoading(true);
        try
        {
            const msg = await HttpUtil.get(
                `/panel/api/clients/subscription/${ encodeURIComponent(email) }`,
                undefined,
                { silent: true }
            );
            if (msg?.success && msg.obj)
            {
                const d = msg.obj as PurchaseSubscription;
                setLinks(d.links ?? []);
                setSubUrl(d.subUrl ?? '');
                setPartial(!!d.partial);
                if (showError)
                {
                    getMessage().success(t('pages.store.success.retried'));
                }
            }
            else if (showError)
            {
                getMessage().error(msg?.msg || t('somethingWentWrong'));
            }
        }
        finally
        {
            setLoading(false);
        }
    };

    // Seed from props on open; fetch when details weren't pre-supplied.
    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const seeded = subscription?.links ?? [];
        setLinks(seeded);
        setSubUrl(subscription?.subUrl ?? '');
        setPartial(subscription?.partial ?? false);
        if (seeded.length === 0 && (subscription?.email ?? '') !== '' && !subscription?.subUrl)
        {
            void fetchDetails(false);
        }
    }, [open, subscription]);

    const configs = useMemo(
        () => links.map((link, i) => ({ link, parts: parseLinkParts(link, email), key: `${ i }` })),
        [links, email]
    );

    return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
          {title ?? t('pages.store.success.title')}
        </span>
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {subUrl ? (
            <Button variant="secondary" onClick={() => copy(subUrl, t('pages.store.success.copiedSub'))}>
              <Copy className="h-4 w-4" aria-hidden />
              {t('pages.store.success.copySub')}
            </Button>
          ) : null}
          {links.length > 0 ? (
            <Button variant="secondary" onClick={() => copy(links.join('\n'), t('pages.store.success.copiedAll'))}>
              <Copy className="h-4 w-4" aria-hidden />
              {t('pages.store.success.copyAll')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => navigate('/services')}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('pages.store.success.openServices')}
          </Button>
          <Button onClick={onClose}>{t('close')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{subtitle ?? t('pages.store.success.subtitle')}</p>

        {partial ? (
          <Alert variant="warning" title={t('pages.store.success.partialTitle')}>
            <div className="flex flex-col items-start gap-2">
              <span>{t('pages.store.success.partialBody')}</span>
              <Button variant="secondary" size="sm" loading={loading} onClick={() => fetchDetails(true)}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t('retry')}
              </Button>
            </div>
          </Alert>
        ) : null}

        {/* Connection summary */}
        {summary ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-sunken p-3 text-sm sm:grid-cols-4">
            <Info label={t('pages.store.success.product')} value={summary.name || '—'} />
            <Info
              label={t('pages.store.success.status')}
              value={
                <Badge variant={summary.active ? 'success' : 'danger'}>
                  {summary.active ? t('pages.store.success.active') : t('pages.services.disabled')}
                </Badge>
              }
            />
            <Info label={t('pages.store.success.traffic')} value={summary.trafficLabel} />
            <Info label={t('pages.store.success.expiry')} value={summary.expiryLabel} />
          </div>
        ) : null}

        {/* Subscription URL */}
        {subUrl ? (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4" aria-hidden />
              {t('pages.store.success.subLink')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={subUrl} className="min-w-0 flex-1 font-mono text-xs" />
              <Button
                variant="secondary"
                size="icon"
                aria-label={t('pages.store.success.copySub')}
                onClick={() => copy(subUrl, t('pages.store.success.copiedSub'))}
              >
                <Copy className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label={t('open')}
                onClick={() => window.open(subUrl, '_blank', 'noopener')}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </Button>
              <QrToggle value={subUrl} label={`sub-${ email }`} />
            </div>
          </section>
        ) : null}

        {/* Configs */}
        {loading && links.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : configs.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t('pages.store.success.configs')} ({configs.length})
            </h3>
            <div className="flex flex-col gap-2">
              {configs.map(({ link, parts, key }) => (
                <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                  <Badge variant="primary">{parts?.protocol ?? t('pages.store.success.config')}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={link}>
                    {link}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('copy')}
                    onClick={() => copy(link, t('pages.store.success.copiedConfig'))}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </Button>
                  <QrToggle value={link} label={`${ parts?.protocol ?? 'config' }-${ email }`} />
                </div>
              ))}
            </div>
          </section>
        ) : !partial ? (
          <p className="text-sm text-muted-foreground">{t('pages.store.success.noConfigs')}</p>
        ) : null}
      </div>
    </Modal>
    );
}

function Info({ label, value }: { label: string; value: ReactNode })
{
    return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
    );
}
