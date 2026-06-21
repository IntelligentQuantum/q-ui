import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { Copy, Eye, QrCode, RefreshCw } from 'lucide-react';

import { ClipboardManager, HttpUtil, IntlUtil, SizeFormatter } from '@/utils';
import { useDatepicker } from '@/hooks/useDatepicker';
import type { ClientRecord, InboundOption } from '@/hooks/useClients';
import { isPostQuantumLink } from '@/lib/xray/inbound-link';
import { LinkTags, linkMetaText, parseLinkParts } from '@/lib/xray/link-label';
import { QrPanel } from '@/pages/inbounds/qr';
import { Button, Modal, Tooltip, cn } from '@/components/ui';

const INBOUND_CHIP_LIMIT = 1;

interface SubSettings {
  enable: boolean;
  subURI: string;
  subJsonURI: string;
  subJsonEnable: boolean;
  subClashURI: string;
  subClashEnable: boolean;
}

interface ClientInfoModalProps {
  open: boolean;
  client: ClientRecord | null;
  inboundsById: Record<number, InboundOption>;
  isOnline: boolean;
  subSettings?: SubSettings;
  onOpenChange: (open: boolean) => void;
}

interface ApiMsg<T = unknown> {
  success?: boolean;
  obj?: T;
}

const DEFAULT_SUB: SubSettings = {
    enable: false,
    subURI: '',
    subJsonURI: '',
    subJsonEnable: false,
    subClashURI: '',
    subClashEnable: false
};

// A token chip; used for status/value pills inside the info table.
function Pill({
    children,
    tone = 'neutral',
    className,
    title
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
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
      title={title}
      className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium', toneClass, className)}
    >
      {children}
    </span>
    );
}

// One labelled row in the info table.
function InfoRow({ label, children }: { label: ReactNode; children: ReactNode })
{
    return (
    <div className="flex flex-col gap-1 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-start sm:gap-3">
      <div className="shrink-0 text-xs text-muted-foreground sm:w-36 sm:pt-0.5">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
    );
}

export default function ClientInfoModal({
    open,
    client,
    inboundsById,
    isOnline,
    subSettings = DEFAULT_SUB,
    onOpenChange
}: ClientInfoModalProps)
{
    const { datepicker } = useDatepicker();
    const { t } = useTranslation();
    const expiryLabel = (ts?: number) =>
    {
        if (!ts)
        {
            return '∞';
        }
        if (ts < 0)
        {
            const days = Math.round(ts / -86400000);
            return `${ t('pages.clients.delayedStart') }: ${ days }d`;
        }
        return IntlUtil.formatDate(ts, datepicker);
    };
    const dateLabel = (ts?: number) => (!ts || ts <= 0 ? '-' : IntlUtil.formatDate(ts, datepicker));
    const [messageApi] = message.useMessage();
    const [links, setLinks] = useState<string[]>([]);
    const [clientIps, setClientIps] = useState<string[]>([]);
    const [ipsLoading, setIpsLoading] = useState(false);
    const [ipsClearing, setIpsClearing] = useState(false);
    const [ipsModalOpen, setIpsModalOpen] = useState(false);
    // The QR panel was an AntD Popover; we now show one QR in a small modal,
    // keyed by the link value + remark to render.
    const [qrTarget, setQrTarget] = useState<{ value: string; remark: string } | null>(null);

    useEffect(() =>
    {
        if (!open)
        {
            setLinks([]);
            setClientIps([]);
            setIpsModalOpen(false);
            setQrTarget(null);
            return;
        }
        if (!client?.subId)
        {
            return;
        }
        let cancelled = false;
        (async () =>
        {
            const msg = await HttpUtil.get(
                `/panel/api/clients/subLinks/${ encodeURIComponent(client.subId!) }`
            ) as ApiMsg<string[]>;
            if (cancelled)
            {
                return;
            }
            setLinks(msg?.success && Array.isArray(msg.obj) ? msg.obj : []);
        })();
        return () =>
        {
            cancelled = true;
        };
    }, [open, client?.subId]);

    const traffic = client?.traffic || null;
    const totalBytes = client?.totalGB || 0;
    const used = (traffic?.up || 0) + (traffic?.down || 0);
    const remaining = useMemo(() =>
    {
        if (totalBytes <= 0)
        {
            return -1;
        }
        const r = totalBytes - used;
        return r > 0 ? r : 0;
    }, [totalBytes, used]);

    const subLink = useMemo(() =>
    {
        if (!client?.subId || !subSettings?.subURI)
        {
            return '';
        }
        return subSettings.subURI + client.subId;
    }, [client?.subId, subSettings?.subURI]);

    const subJsonLink = useMemo(() =>
    {
        if (!client?.subId)
        {
            return '';
        }
        if (!subSettings?.subJsonEnable || !subSettings?.subJsonURI)
        {
            return '';
        }
        return subSettings.subJsonURI + client.subId;
    }, [client?.subId, subSettings?.subJsonEnable, subSettings?.subJsonURI]);

    const subClashLink = useMemo(() =>
    {
        if (!client?.subId)
        {
            return '';
        }
        if (!subSettings?.subClashEnable || !subSettings?.subClashURI)
        {
            return '';
        }
        return subSettings.subClashURI + client.subId;
    }, [client?.subId, subSettings?.subClashEnable, subSettings?.subClashURI]);

    const showSubscription = !!(subSettings?.enable && client?.subId);

    async function copyValue(text: string)
    {
        if (!text)
        {
            return;
        }
        const ok = await ClipboardManager.copyText(String(text));
        if (ok)
        {
            messageApi.success(t('copied'));
        }
    }

    async function loadIps()
    {
        if (!client?.email)
        {
            return;
        }
        setIpsLoading(true);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/clients/ips/${ encodeURIComponent(client.email) }`) as ApiMsg<unknown[]>;
            if (!msg?.success)
            {
                setClientIps([]); return;
            }
            const arr = Array.isArray(msg.obj) ? msg.obj : [];
            setClientIps(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
        }
        finally
        {
            setIpsLoading(false);
        }
    }

    async function clearIps()
    {
        if (!client?.email)
        {
            return;
        }
        setIpsClearing(true);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/clients/clearIps/${ encodeURIComponent(client.email) }`) as ApiMsg;
            if (msg?.success)
            {
                setClientIps([]);
            }
        }
        finally
        {
            setIpsClearing(false);
        }
    }

    function openIpsModal()
    {
        setIpsModalOpen(true);
        if (clientIps.length === 0)
        {
            void loadIps();
        }
    }

    function copyBtn(value: string)
    {
        return (
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t('copy')} onClick={() => copyValue(value)}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </Button>
        );
    }

    function inboundChip(id: number)
    {
        const ib = inboundsById[id];
        const label = ib?.remark?.trim() || ib?.tag || '';
        return (
      <Tooltip key={id} content={label}>
        <Pill tone="accent">{label}</Pill>
      </Tooltip>
        );
    }

    return (
    <>
      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        size="lg"
        title={client ? `${ t('pages.clients.clientInfo') } — ${ client.email }` : t('pages.clients.clientInfo')}
      >
        {client && (
          <div className="flex flex-col">
            <div className="flex flex-col">
              <InfoRow label={t('pages.clients.online')}>
                {client.enable && isOnline
                    ? <Pill tone="success">{t('pages.clients.online')}</Pill>
                    : <Pill tone="neutral">{t('pages.clients.offline')}</Pill>}
                <span className="text-xs text-muted-foreground">{t('lastOnline')}: {dateLabel(traffic?.lastOnline)}</span>
              </InfoRow>

              <InfoRow label={t('status')}>
                <Pill tone={client.enable ? 'success' : 'neutral'}>
                  {client.enable ? t('enabled') : t('disabled')}
                </Pill>
              </InfoRow>

              <InfoRow label={t('pages.clients.email')}>
                {client.email
                    ? <Pill tone="success">{client.email}</Pill>
                    : <Pill tone="danger">{t('none')}</Pill>}
              </InfoRow>

              <InfoRow label={t('pages.clients.subId')}>
                <Pill tone="neutral" title={client.subId || '-'}>{client.subId || '-'}</Pill>
                {client.subId && copyBtn(client.subId)}
              </InfoRow>

              {client.uuid && (
                <InfoRow label={t('pages.clients.uuid')}>
                  <Pill tone="neutral" title={client.uuid}>{client.uuid}</Pill>
                  {copyBtn(client.uuid)}
                </InfoRow>
              )}

              {client.password && (
                <InfoRow label={t('password')}>
                  <Pill tone="neutral" title={client.password}>{client.password}</Pill>
                  {copyBtn(client.password)}
                </InfoRow>
              )}

              {client.auth && (
                <InfoRow label={t('pages.clients.auth')}>
                  <Pill tone="neutral" title={client.auth}>{client.auth}</Pill>
                  {copyBtn(client.auth)}
                </InfoRow>
              )}

              <InfoRow label={t('pages.clients.flow')}>
                {client.flow ? <Pill tone="neutral">{client.flow}</Pill> : <Pill tone="warning">{t('none')}</Pill>}
              </InfoRow>

              <InfoRow label={t('pages.inbounds.traffic')}>
                <Pill tone="neutral">
                  ↑ {SizeFormatter.sizeFormat(traffic?.up || 0)}
                  {' '}/ ↓ {SizeFormatter.sizeFormat(traffic?.down || 0)}
                </Pill>
                <span className="text-xs text-muted-foreground">
                  {SizeFormatter.sizeFormat(used)} / {totalBytes > 0 ? SizeFormatter.sizeFormat(totalBytes) : '∞'}
                </span>
              </InfoRow>

              <InfoRow label={t('remained')}>
                {remaining < 0
                    ? <Pill tone="accent">∞</Pill>
                    : <Pill tone={remaining > 0 ? 'neutral' : 'danger'}>{SizeFormatter.sizeFormat(remaining)}</Pill>}
              </InfoRow>

              <InfoRow label={t('pages.inbounds.expireDate')}>
                {!client.expiryTime
                    ? <Pill tone="accent">∞</Pill>
                    : <Pill tone={client.expiryTime < 0 ? 'accent' : 'neutral'}>{expiryLabel(client.expiryTime)}</Pill>}
                {(client.expiryTime ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">{IntlUtil.formatRelativeTime(client.expiryTime)}</span>
                )}
              </InfoRow>

              <InfoRow label={t('pages.clients.ipLimit')}>
                {!client.limitIp ? <Pill tone="neutral">∞</Pill> : <Pill tone="neutral">{client.limitIp}</Pill>}
              </InfoRow>

              <InfoRow label={t('pages.inbounds.IPLimitlog')}>
                <Button size="sm" variant="secondary" loading={ipsLoading} onClick={openIpsModal}>
                  <Eye className="h-4 w-4" aria-hidden />
                  {clientIps.length > 0 ? clientIps.length : ''}
                </Button>
              </InfoRow>

              <InfoRow label={t('pages.inbounds.createdAt')}>
                <Pill tone="neutral">{dateLabel(client.createdAt)}</Pill>
              </InfoRow>

              <InfoRow label={t('pages.inbounds.updatedAt')}>
                <Pill tone="neutral">{dateLabel(client.updatedAt)}</Pill>
              </InfoRow>

              {client.comment && (
                <InfoRow label={t('pages.clients.comment')}>
                  <Pill tone="neutral" title={client.comment}>{client.comment}</Pill>
                </InfoRow>
              )}

              <InfoRow label={t('pages.clients.attachedInbounds')}>
                {(() =>
                {
                    const ids = client.inboundIds || [];
                    if (ids.length === 0)
                    {
                        return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    const visible = ids.slice(0, INBOUND_CHIP_LIMIT);
                    const overflow = ids.slice(INBOUND_CHIP_LIMIT);
                    return (
                    <div className="flex flex-wrap items-center gap-1">
                      {visible.map((id) => inboundChip(id))}
                      {overflow.length > 0 && (
                        <Tooltip
                          content={
                            <div className="flex max-h-64 max-w-[260px] flex-col gap-1 overflow-y-auto">
                              {overflow.map((id) =>
                              {
                                  const ib = inboundsById[id];
                                  return <span key={id} className="truncate text-xs">{ib?.remark?.trim() || ib?.tag || ''}</span>;
                              })}
                            </div>
                          }
                        >
                          <Pill tone="neutral">+{overflow.length}</Pill>
                        </Tooltip>
                      )}
                    </div>
                    );
                })()}
              </InfoRow>
            </div>

            {links.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t('pages.inbounds.copyLink')}
                  <span className="h-px flex-1 bg-border" />
                </div>
                {links.map((link, idx) =>
                {
                    const parts = parseLinkParts(link, client.email);
                    const fallback = `${ t('pages.clients.link') } ${ idx + 1 }`;
                    const rowTitle = (parts && linkMetaText(parts)) || fallback;
                    const qrRemark = [parts?.remark, client.email].filter(Boolean).join('-') || rowTitle;
                    const canQr = !isPostQuantumLink(link);
                    return (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      {parts
                          ? <LinkTags parts={parts} />
                          : <Pill tone="neutral">LINK</Pill>}
                      <span className="min-w-0 flex-1 truncate text-[13px]" title={rowTitle}>{rowTitle}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip content={t('copy')}>
                          <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={t('copy')} onClick={() => copyValue(link)}>
                            <Copy className="h-4 w-4" aria-hidden />
                          </Button>
                        </Tooltip>
                        {canQr && (
                          <Tooltip content={t('pages.clients.qrCode')}>
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8"
                              aria-label={t('pages.clients.qrCode')}
                              onClick={() => setQrTarget({ value: link, remark: qrRemark })}
                            >
                              <QrCode className="h-4 w-4" aria-hidden />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    );
                })}
              </div>
            )}

            {showSubscription && subLink && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t('subscription.title')}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <SubLinkRow
                  tone="success"
                  tag="SUB"
                  href={subLink}
                  label={client.subId || ''}
                  copyLabel={t('copy')}
                  qrLabel={t('pages.clients.qrCode')}
                  onCopy={() => copyValue(subLink)}
                  onQr={() => setQrTarget({ value: subLink, remark: `${ client.email } — ${ t('subscription.title') }` })}
                />
                {subJsonLink && (
                  <SubLinkRow
                    tone="accent"
                    tag="JSON"
                    href={subJsonLink}
                    label={client.subId || ''}
                    copyLabel={t('copy')}
                    qrLabel={t('pages.clients.qrCode')}
                    onCopy={() => copyValue(subJsonLink)}
                    onQr={() => setQrTarget({ value: subJsonLink, remark: `${ client.email } — JSON` })}
                  />
                )}
                {subClashLink && (
                  <SubLinkRow
                    tone="warning"
                    tag="CLASH"
                    tagTitle="Clash / Mihomo"
                    href={subClashLink}
                    label={client.subId || ''}
                    copyLabel={t('copy')}
                    qrLabel={t('pages.clients.qrCode')}
                    onCopy={() => copyValue(subClashLink)}
                    onQr={() => setQrTarget({ value: subClashLink, remark: `${ client.email } — Clash / Mihomo` })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* QR preview for any link/subscription row. */}
      <Modal
        open={!!qrTarget}
        onClose={() => setQrTarget(null)}
        size="sm"
        title={t('pages.clients.qrCode')}
      >
        {qrTarget && (
          <div className="flex justify-center">
            <QrPanel value={qrTarget.value} remark={qrTarget.remark} size={220} />
          </div>
        )}
      </Modal>

      <Modal
        open={ipsModalOpen}
        onClose={() => setIpsModalOpen(false)}
        size="sm"
        title={`${ t('pages.inbounds.IPLimitlog') }${ client?.email ? ` — ${ client.email }` : '' }`}
        footer={
          <>
            <Button variant="secondary" loading={ipsLoading} onClick={loadIps}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('refresh')}
            </Button>
            <Button variant="danger" loading={ipsClearing} disabled={clientIps.length === 0} onClick={clearIps}>
              {t('pages.clients.clearAll')}
            </Button>
            <Button variant="primary" onClick={() => setIpsModalOpen(false)}>
              {t('close')}
            </Button>
          </>
        }
      >
        {clientIps.length > 0 ? (
          <div className="flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
            {clientIps.map((ip, idx) => (
              <span
                key={idx}
                className="w-fit max-w-full rounded-md bg-accent-subtle px-2 py-0.5 font-mono text-xs text-accent"
              >
                {ip}
              </span>
            ))}
          </div>
        ) : (
          <Pill tone="neutral">{t('tgbot.noIpRecord')}</Pill>
        )}
      </Modal>
    </>
    );
}

// A subscription/link row with a tag, anchor and copy/QR actions.
function SubLinkRow({
    tone,
    tag,
    tagTitle,
    href,
    label,
    copyLabel,
    qrLabel,
    onCopy,
    onQr
}: {
  tone: 'success' | 'accent' | 'warning';
  tag: string;
  tagTitle?: string;
  href: string;
  label: string;
  copyLabel: string;
  qrLabel: string;
  onCopy: () => void;
  onQr: () => void;
})
{
    const toneClass = {
        success: 'bg-success-subtle text-success',
        accent: 'bg-accent-subtle text-accent',
        warning: 'bg-warning-subtle text-warning'
    }[tone];
    const tagEl = (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide', toneClass)}>{tag}</span>
    );
    return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      {tagTitle ? <Tooltip content={tagTitle}>{tagEl}</Tooltip> : tagEl}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-[13px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        title={href}
      >
        {label}
      </a>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip content={copyLabel}>
          <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={copyLabel} onClick={onCopy}>
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content={qrLabel}>
          <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={qrLabel} onClick={onQr}>
            <QrCode className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>
    </div>
    );
}
