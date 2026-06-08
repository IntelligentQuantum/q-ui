import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, RefreshCw, Trash2, Download } from 'lucide-react';

import { HttpUtil, IntlUtil, SizeFormatter, ColorUtils } from '@/utils';
import { Protocols } from '@/schemas/primitives';
import { InfinityIcon, Modal, Tabs, Badge, Button, Tooltip, type BadgeVariant } from '@/components/ui';
import { useDatepicker } from '@/hooks/useDatepicker';
import {
    genAllLinks,
    genWireguardConfigs,
    genWireguardLinks,
    preferPublicHost
} from '@/lib/xray/inbound-link';
import { inboundFromDb } from '@/lib/xray/inbound-from-db';

import {
    buildInboundInfo,
    copyText,
    downloadText,
    formatIpInfo,
    hasShareLink,
    statsColor
} from './helpers';
import type { ClientSetting, ClientStats, InboundInfo, InboundInfoModalProps } from './types';

// Map the legacy AntD Tag color tokens (and ColorUtils outputs) onto Badge variants.
function tagVariant(color?: string): BadgeVariant
{
    switch (color)
    {
        case 'green':
        case 'success':
            return 'success';
        case 'red':
        case 'error':
            return 'danger';
        case 'orange':
        case 'gold':
        case 'warning':
            return 'warning';
        case 'blue':
        case 'purple':
            return 'primary';
        default:
            return 'neutral';
    }
}

// Section divider with a centered label, used to separate info groups.
function SectionDivider({ children }: { children: ReactNode })
{
    return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
    );
}

// Two-column "label | value" row.
function InfoRow({ label, children }: { label: ReactNode; children: ReactNode })
{
    return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 border-b border-border py-1.5 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)]">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
    );
}

// Small icon-only copy button.
function IconButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode })
{
    return (
    <Button aria-label={label} variant="secondary" size="icon" className="h-7 w-7 shrink-0" onClick={onClick}>
      {icon}
    </Button>
    );
}

// A copyable link/code block with header.
function LinkPanel({
    title,
    value,
    isAnchor,
    onCopy,
    copyLabel,
    extra
}: {
  title: ReactNode;
  value: string;
  isAnchor?: boolean;
  onCopy: () => void;
  copyLabel: string;
  extra?: ReactNode;
})
{
    return (
    <div className="mb-2.5 flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="success">{title}</Badge>
        <Tooltip content={copyLabel}>
          <IconButton label={copyLabel} onClick={onCopy} icon={<Copy className="h-3.5 w-3.5" aria-hidden />} />
        </Tooltip>
        {extra}
      </div>
      {isAnchor ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-[11px] text-accent underline decoration-accent/40 hover:decoration-accent"
        >
          {value}
        </a>
      ) : (
        <code className="break-all whitespace-pre-wrap rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-[11px] select-all">
          {value}
        </code>
      )}
    </div>
    );
}

export default function InboundInfoModal({
    open,
    onClose,
    dbInbound,
    clientIndex = 0,
    remarkModel = '-io',
    expireDiff = 0,
    trafficDiff = 0,
    ipLimitEnable = false,
    tgBotEnable = false,
    nodeAddress = '',
    subSettings,
    lastOnlineMap = {}
}: InboundInfoModalProps)
{
    const { t } = useTranslation();
    const { datepicker } = useDatepicker();

    const [inbound, setInbound] = useState<InboundInfo | null>(null);
    const [clientSettings, setClientSettings] = useState<ClientSetting | null>(null);
    const [clientStats, setClientStats] = useState<ClientStats | null>(null);
    const [links, setLinks] = useState<{ remark?: string; link: string }[]>([]);
    const [wireguardConfigs, setWireguardConfigs] = useState<string[]>([]);
    const [wireguardLinks, setWireguardLinks] = useState<string[]>([]);
    const [subLink, setSubLink] = useState('');
    const [subJsonLink, setSubJsonLink] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [clientIpsArray, setClientIpsArray] = useState<string[]>([]);
    const [clientIpsText, setClientIpsText] = useState('');
    const [activeTab, setActiveTab] = useState('client');

    const loadClientIps = useCallback(async () =>
    {
        if (!clientStats?.email)
        {
            return;
        }
        setRefreshing(true);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/clients/ips/${ clientStats.email }`);
            if (!msg?.success)
            {
                setClientIpsText((msg?.obj as string) || 'No IP record');
                setClientIpsArray([]);
                return;
            }
            let ips: unknown = msg.obj;
            if (typeof ips === 'string')
            {
                try
                {
                    ips = JSON.parse(ips);
                }
                catch
                {
                    setClientIpsText(String(ips));
                    setClientIpsArray([String(ips)]);
                    return;
                }
            }
            if (ips && !Array.isArray(ips) && typeof ips === 'object')
            {
                ips = [ips];
            }
            if (Array.isArray(ips) && ips.length > 0)
            {
                const arr = (ips as unknown[]).map(formatIpInfo).filter(Boolean) as string[];
                setClientIpsArray(arr);
                setClientIpsText(arr.join(' | '));
            }
            else
            {
                setClientIpsArray([]);
                setClientIpsText(String(ips || t('tgbot.noIpRecord')));
            }
        }
        finally
        {
            setRefreshing(false);
        }
    }, [clientStats, t]);

    const clearClientIps = useCallback(async () =>
    {
        if (!clientStats?.email)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/clients/clearIps/${ clientStats.email }`);
        if (msg?.success)
        {
            setClientIpsArray([]);
            setClientIpsText(t('tgbot.noIpRecord'));
        }
    }, [clientStats, t]);

    useEffect(() =>
    {
        if (!open || !dbInbound)
        {
            return;
        }
        const info = buildInboundInfo(dbInbound);
        setInbound(info);
        setActiveTab(info.clients.length > 0 ? 'client' : 'inbound');

        const idx = clientIndex ?? 0;
        const clientSet = info.clients.length > 0 ? (info.clients[idx] || null) : null;
        setClientSettings(clientSet);
        const stats = clientSet
            ? (dbInbound.clientStats || []).find((s) => s.email === clientSet.email) || null
            : null;
        setClientStats(stats);

        const inboundForLinks = inboundFromDb(dbInbound);
        const fallbackHostname = preferPublicHost(window.location.hostname, subSettings?.publicHost ?? '');
        if (info.protocol === Protocols.WIREGUARD)
        {
            setWireguardConfigs(
                genWireguardConfigs({
                    inbound: inboundForLinks,
                    remark: dbInbound.remark,
                    remarkModel: '-io',
                    hostOverride: nodeAddress,
                    fallbackHostname
                }).split('\r\n')
            );
            setWireguardLinks(
                genWireguardLinks({
                    inbound: inboundForLinks,
                    remark: dbInbound.remark,
                    remarkModel: '-io',
                    hostOverride: nodeAddress,
                    fallbackHostname
                }).split('\r\n')
            );
            setLinks([]);
        }
        else
        {
            setLinks(
                genAllLinks({
                    inbound: inboundForLinks,
                    remark: dbInbound.remark,
                    remarkModel,
                    client: (clientSet ?? {}) as Parameters<typeof genAllLinks>[0]['client'],
                    hostOverride: nodeAddress,
                    fallbackHostname
                })
            );
            setWireguardConfigs([]);
            setWireguardLinks([]);
        }

        if (clientSet?.subId)
        {
            setSubLink((subSettings?.subURI || '') + clientSet.subId);
            setSubJsonLink(
                subSettings?.subJsonEnable ? (subSettings?.subJsonURI || '') + clientSet.subId : ''
            );
        }
        else
        {
            setSubLink('');
            setSubJsonLink('');
        }

        setClientIpsArray([]);
        setClientIpsText('');

        if (ipLimitEnable && (clientSet?.limitIp ?? 0) > 0 && stats?.email)
        {
            void HttpUtil.post(`/panel/api/clients/ips/${ stats.email }`).then((msg) =>
            {
                if (!msg?.success)
                {
                    setClientIpsText((msg?.obj as string) || 'No IP record');
                    return;
                }
                let ips: unknown = msg.obj;
                if (typeof ips === 'string')
                {
                    try
                    {
                        ips = JSON.parse(ips);
                    }
                    catch
                    {
                        setClientIpsText(String(ips));
                        setClientIpsArray([String(ips)]);
                        return;
                    }
                }
                if (ips && !Array.isArray(ips) && typeof ips === 'object')
                {
                    ips = [ips];
                }
                if (Array.isArray(ips) && ips.length > 0)
                {
                    const arr = (ips as unknown[]).map(formatIpInfo).filter(Boolean) as string[];
                    setClientIpsArray(arr);
                    setClientIpsText(arr.join(' | '));
                }
                else
                {
                    setClientIpsText(String(ips || t('tgbot.noIpRecord')));
                }
            });
        }
    }, [open, dbInbound, clientIndex, remarkModel, nodeAddress, subSettings, ipLimitEnable, t]);

    const isEnable = useMemo(() =>
    {
        if (clientSettings)
        {
            return !!clientSettings.enable;
        }
        return dbInbound?.enable ?? true;
    }, [clientSettings, dbInbound]);

    const isDepleted = useMemo(() =>
    {
        if (!clientStats || !clientSettings)
        {
            return false;
        }
        const total = clientStats.total ?? 0;
        const used = (clientStats.up ?? 0) + (clientStats.down ?? 0);
        if (total > 0 && used >= total)
        {
            return true;
        }
        const expiry = clientSettings.expiryTime ?? 0;
        if (expiry > 0 && Date.now() >= expiry)
        {
            return true;
        }
        return false;
    }, [clientStats, clientSettings]);

    const remainingStats = useMemo(() =>
    {
        if (!clientStats || !clientSettings)
        {
            return '-';
        }
        const remained = clientStats.total - clientStats.up - clientStats.down;
        return remained > 0 ? SizeFormatter.sizeFormat(remained) : '-';
    }, [clientStats, clientSettings]);

    const formatLastOnline = useCallback(
        (email: string) =>
        {
            const ts = lastOnlineMap[email];
            if (!ts)
            {
                return '-';
            }
            return IntlUtil.formatDate(ts, datepicker);
        },
        [lastOnlineMap, datepicker]
    );

    const networkLabel = inbound?.stream?.network || '';
    const securityLabel = inbound?.stream?.security || 'none';
    const securityVariant: BadgeVariant = securityLabel === 'none' ? 'danger' : 'success';
    const encryptionLabel = (inbound?.settings?.encryption as string) || '';
    const serverNameLabel = inbound?.serverName || '';
    const showClientTab = !!clientSettings;
    const showSubscriptionTab = !!(subSettings?.enable && clientSettings?.subId);

    if (!dbInbound || !inbound)
    {
        return <Modal open={open} onClose={onClose} title={t('pages.inbounds.inboundInfo')} size="lg" />;
    }

    const clientTab = (
    <>
      <div className="flex flex-col">
        <InfoRow label={t('pages.inbounds.email')}>
          {clientSettings?.email ? (
            <Badge variant="success">{clientSettings.email}</Badge>
          ) : (
            <Badge variant="danger">{t('none')}</Badge>
          )}
        </InfoRow>
        {clientSettings?.id && (
          <InfoRow label="ID"><Badge variant="neutral">{clientSettings.id}</Badge></InfoRow>
        )}
        {dbInbound.isVMess && (
          <InfoRow label={t('security')}><Badge variant="neutral">{clientSettings?.security}</Badge></InfoRow>
        )}
        {inbound.isVlessTlsFlow && (
          <InfoRow label={t('pages.clients.flow')}>
            {clientSettings?.flow ? <Badge variant="neutral">{clientSettings.flow}</Badge> : <Badge variant="warning">{t('none')}</Badge>}
          </InfoRow>
        )}
        {clientSettings?.password && (
          <InfoRow label={t('password')}><Badge variant="neutral" className="max-w-full truncate">{clientSettings.password}</Badge></InfoRow>
        )}
        <InfoRow label={t('status')}>
          {isDepleted ? (
            <Badge variant="danger">{t('depleted')}</Badge>
          ) : isEnable ? (
            <Badge variant="success">{t('enabled')}</Badge>
          ) : (
            <Badge variant="neutral">{t('disabled')}</Badge>
          )}
        </InfoRow>
        {clientStats && (
          <InfoRow label={t('usage')}>
            <span className="flex flex-wrap gap-1">
              <Badge variant="success">{SizeFormatter.sizeFormat(clientStats.up + clientStats.down)}</Badge>
              <Badge variant="neutral">
                ↑ {SizeFormatter.sizeFormat(clientStats.up)} /
                {' '}{SizeFormatter.sizeFormat(clientStats.down)} ↓
              </Badge>
            </span>
          </InfoRow>
        )}
        <InfoRow label={t('pages.inbounds.createdAt')}>
          <Badge variant="neutral">{clientSettings?.created_at ? IntlUtil.formatDate(clientSettings.created_at, datepicker) : '-'}</Badge>
        </InfoRow>
        <InfoRow label={t('pages.inbounds.updatedAt')}>
          <Badge variant="neutral">{clientSettings?.updated_at ? IntlUtil.formatDate(clientSettings.updated_at, datepicker) : '-'}</Badge>
        </InfoRow>
        <InfoRow label={t('lastOnline')}>
          <Badge variant="neutral">{formatLastOnline(clientSettings?.email || '')}</Badge>
        </InfoRow>
        {clientSettings?.comment && (
          <InfoRow label={t('comment')}><Badge variant="neutral" className="max-w-full truncate">{clientSettings.comment}</Badge></InfoRow>
        )}
        {ipLimitEnable && (
          <InfoRow label={t('pages.inbounds.IPLimit')}><Badge variant="neutral">{clientSettings?.limitIp ?? 0}</Badge></InfoRow>
        )}
        {ipLimitEnable && (clientSettings?.limitIp ?? 0) > 0 && (
          <InfoRow label={t('pages.inbounds.IPLimitlog')}>
            <div>
              <div className="max-h-[150px] overflow-y-auto text-start">
                {clientIpsArray.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {clientIpsArray.map((item, idx) => (
                      <Badge variant="primary" className="font-mono text-[11px]" key={idx}>{item}</Badge>
                    ))}
                  </div>
                ) : (
                  <Badge variant="neutral">{clientIpsText || t('tgbot.noIpRecord')}</Badge>
                )}
              </div>
              <div className="mt-1.5 flex gap-3 text-muted-foreground">
                <button type="button" aria-label="refresh" onClick={() => loadClientIps()} className="hover:text-foreground">
                  <RefreshCw className={`h-4 w-4 ${ refreshing ? 'animate-spin' : '' }`} aria-hidden />
                </button>
                <Tooltip content={t('pages.inbounds.IPLimitlogclear')}>
                  <button type="button" aria-label={t('pages.inbounds.IPLimitlogclear')} onClick={() => clearClientIps()} className="hover:text-danger">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </Tooltip>
              </div>
            </div>
          </InfoRow>
        )}
      </div>

      <table className="my-3 w-full text-center text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 font-medium">{t('remained')}</th>
            <th className="px-2 py-1 font-medium">{t('pages.inbounds.totalUsage')}</th>
            <th className="px-2 py-1 font-medium">{t('pages.inbounds.expireDate')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1">
              {clientStats && (clientSettings?.totalGB ?? 0) > 0 ? (
                <Badge variant={tagVariant(statsColor(clientStats, trafficDiff))}>{remainingStats}</Badge>
              ) : !clientSettings?.totalGB || clientSettings.totalGB <= 0 ? (
                <Badge variant="primary"><InfinityIcon /></Badge>
              ) : null}
            </td>
            <td className="px-2 py-1">
              {(clientSettings?.totalGB ?? 0) > 0 ? (
                <Badge variant={clientStats ? tagVariant(statsColor(clientStats, trafficDiff)) : 'neutral'}>
                  {SizeFormatter.sizeFormat(clientSettings!.totalGB!)}
                </Badge>
              ) : (
                <Badge variant="primary"><InfinityIcon /></Badge>
              )}
            </td>
            <td className="px-2 py-1">
              {(clientSettings?.expiryTime ?? 0) > 0 ? (
                <Badge variant={tagVariant(ColorUtils.usageColor(Date.now(), expireDiff, clientSettings!.expiryTime!))}>
                  {IntlUtil.formatDate(clientSettings!.expiryTime!, datepicker)}
                </Badge>
              ) : (clientSettings?.expiryTime ?? 0) < 0 ? (
                <Badge variant="success">{clientSettings!.expiryTime! / -86400000} {t('day')}</Badge>
              ) : (
                <Badge variant="primary"><InfinityIcon /></Badge>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {tgBotEnable && clientSettings?.tgId && (
        <>
          <SectionDivider>Telegram</SectionDivider>
          <div className="flex items-center gap-1.5">
            <Badge variant="primary">{clientSettings.tgId}</Badge>
            <Tooltip content={t('copy')}>
              <IconButton label={t('copy')} onClick={() => copyText(clientSettings.tgId, t)} icon={<Copy className="h-3.5 w-3.5" aria-hidden />} />
            </Tooltip>
          </div>
        </>
      )}

      {hasShareLink(dbInbound.protocol) && links.length > 0 && (
        <>
          <SectionDivider>{t('pages.inbounds.copyLink')}</SectionDivider>
          {links.map((link, idx) => (
            <LinkPanel key={idx} title={link.remark || `Link ${ idx + 1 }`} value={link.link} copyLabel={t('copy')} onCopy={() => copyText(link.link, t)} />
          ))}
        </>
      )}

      {showSubscriptionTab && (
        <>
          <SectionDivider>{t('subscription.title')}</SectionDivider>
          <LinkPanel title={t('subscription.title')} value={subLink} isAnchor copyLabel={t('copy')} onCopy={() => copyText(subLink, t)} />
          {subSettings?.subJsonEnable && subJsonLink && (
            <LinkPanel title="JSON" value={subJsonLink} isAnchor copyLabel={t('copy')} onCopy={() => copyText(subJsonLink, t)} />
          )}
        </>
      )}
    </>
    );

    const inboundTab = (
    <>
      <div className="flex flex-col">
        <InfoRow label={t('pages.inbounds.protocol')}><Badge variant="primary">{dbInbound.protocol}</Badge></InfoRow>
        <InfoRow label={t('pages.inbounds.address')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{dbInbound.address}</Badge></InfoRow>
        <InfoRow label={t('pages.inbounds.port')}><Badge variant="neutral">{dbInbound.port}</Badge></InfoRow>

        {(dbInbound.isVMess || dbInbound.isVLess || dbInbound.isTrojan || dbInbound.isSS) && (
          <>
            <InfoRow label={t('transmission')}><Badge variant="success">{networkLabel}</Badge></InfoRow>
            {(inbound.isTcp || inbound.isWs || inbound.isHttpupgrade || inbound.isXHTTP) && (
              <>
                <InfoRow label={t('host')}>{inbound.host ? <Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.host}</Badge> : <Badge variant="warning">{t('none')}</Badge>}</InfoRow>
                <InfoRow label={t('path')}>{inbound.path ? <Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.path}</Badge> : <Badge variant="warning">{t('none')}</Badge>}</InfoRow>
              </>
            )}
            {inbound.isXHTTP && (
              <InfoRow label={t('pages.inbounds.info.mode')}><Badge variant="neutral">{inbound.stream?.xhttp?.mode}</Badge></InfoRow>
            )}
            {inbound.isGrpc && (
              <>
                <InfoRow label={t('pages.inbounds.info.grpcServiceName')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.serviceName}</Badge></InfoRow>
                <InfoRow label={t('pages.inbounds.info.grpcMultiMode')}><Badge variant="neutral">{String(inbound.stream?.grpc?.multiMode)}</Badge></InfoRow>
              </>
            )}
          </>
        )}

        {hasShareLink(dbInbound.protocol) && (
          <>
            <InfoRow label={t('security')}><Badge variant={securityVariant}>{securityLabel}</Badge></InfoRow>
            {encryptionLabel && (
              <InfoRow label={t('encryption')}>
                <span className="flex items-start gap-1.5">
                  <code className="min-w-0 flex-1 break-all whitespace-pre-wrap rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs select-all">{encryptionLabel}</code>
                  <Tooltip content={t('copy')}>
                    <IconButton label={t('copy')} onClick={() => copyText(encryptionLabel, t)} icon={<Copy className="h-3.5 w-3.5" aria-hidden />} />
                  </Tooltip>
                </span>
              </InfoRow>
            )}
            {securityLabel !== 'none' && (
              <InfoRow label={t('domainName')}>
                {serverNameLabel ? (
                  <Badge variant="success" className="max-w-full whitespace-normal break-all">{serverNameLabel}</Badge>
                ) : (
                  <Badge variant="warning">{t('none')}</Badge>
                )}
              </InfoRow>
            )}
          </>
        )}
      </div>

      {dbInbound.isSS && inbound.settings && (
        <div className="mt-2.5 flex flex-col">
          <InfoRow label={t('encryption')}><Badge variant="success">{inbound.settings.method as string}</Badge></InfoRow>
          {inbound.isSS2022 && (
            <InfoRow label={t('password')}><Badge variant="neutral" className="max-w-full truncate">{inbound.settings.password as string}</Badge></InfoRow>
          )}
          <InfoRow label={t('pages.inbounds.network')}><Badge variant="success">{inbound.settings.network as string}</Badge></InfoRow>
        </div>
      )}

      {inbound.protocol === Protocols.TUN && inbound.settings && (
        <div className="mt-2.5 flex flex-col">
          <InfoRow label={t('pages.inbounds.info.interfaceName')}><Badge variant="success" className="max-w-full whitespace-normal break-all">{inbound.settings.name as string}</Badge></InfoRow>
          <InfoRow label={t('pages.inbounds.info.mtu')}><Badge variant="success">{inbound.settings.mtu as number}</Badge></InfoRow>
          {Array.isArray(inbound.settings.gateway) && (inbound.settings.gateway as string[]).length > 0 && (
            <InfoRow label={t('pages.inbounds.info.gateway')}>
              <span className="flex flex-wrap gap-1">
                {(inbound.settings.gateway as string[]).map((ip, j) => (
                  <Badge key={`tun-gw-${ j }`} variant="success" className="max-w-full whitespace-normal break-all">{ip}</Badge>
                ))}
              </span>
            </InfoRow>
          )}
          {Array.isArray(inbound.settings.dns) && (inbound.settings.dns as string[]).length > 0 && (
            <InfoRow label={t('pages.inbounds.info.dns')}>
              <span className="flex flex-wrap gap-1">
                {(inbound.settings.dns as string[]).map((ip, j) => (
                  <Badge key={`tun-dns-${ j }`} variant="success">{ip}</Badge>
                ))}
              </span>
            </InfoRow>
          )}
          <InfoRow label={t('pages.inbounds.info.outboundsInterface')}><Badge variant="success">{(inbound.settings.autoOutboundsInterface as string) || 'auto'}</Badge></InfoRow>
          {Array.isArray(inbound.settings.autoSystemRoutingTable) && (inbound.settings.autoSystemRoutingTable as string[]).length > 0 && (
            <InfoRow label={t('pages.inbounds.info.autoSystemRoutes')}>
              <span className="flex flex-wrap gap-1">
                {(inbound.settings.autoSystemRoutingTable as string[]).map((cidr, j) => (
                  <Badge key={`tun-rt-${ j }`} variant="success">{cidr}</Badge>
                ))}
              </span>
            </InfoRow>
          )}
        </div>
      )}

      {inbound.protocol === Protocols.TUNNEL && inbound.settings && (
        <div className="mt-2.5 flex flex-col">
          <InfoRow label={t('pages.inbounds.targetAddress')}><Badge variant="success" className="max-w-full whitespace-normal break-all">{inbound.settings.rewriteAddress as string}</Badge></InfoRow>
          <InfoRow label={t('pages.inbounds.destinationPort')}><Badge variant="success">{inbound.settings.rewritePort as number}</Badge></InfoRow>
          <InfoRow label={t('pages.inbounds.network')}><Badge variant="success">{inbound.settings.allowedNetwork as string}</Badge></InfoRow>
          <InfoRow label={t('pages.inbounds.info.followRedirect')}>
            <Badge variant={inbound.settings.followRedirect ? 'success' : 'danger'}>
              {inbound.settings.followRedirect ? t('enabled') : t('disabled')}
            </Badge>
          </InfoRow>
        </div>
      )}

      {dbInbound.isMixed && inbound.settings && (
        <div className="mt-2.5 flex flex-col">
          <InfoRow label={t('pages.inbounds.info.auth')}>
            <Badge variant={inbound.settings.auth === 'password' ? 'success' : 'warning'}>
              {inbound.settings.auth as string}
            </Badge>
          </InfoRow>
          <InfoRow label="UDP">
            <Badge variant={inbound.settings.udp ? 'success' : 'danger'}>
              {inbound.settings.udp ? t('enabled') : t('disabled')}
            </Badge>
          </InfoRow>
          {(inbound.settings.ip as string) && (
            <InfoRow label="IP"><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.settings.ip as string}</Badge></InfoRow>
          )}
          {inbound.settings.auth === 'password' && Array.isArray(inbound.settings.accounts) && (
            <>
              {(inbound.settings.accounts as { user: string; pass: string }[]).map((account, idx) => (
                <InfoRow key={idx} label={`${ t('username') } #${ idx + 1 }`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="success" className="max-w-full whitespace-normal break-all">{account.user}</Badge>
                    <span className="font-semibold opacity-55">:</span>
                    <Badge variant="neutral" className="max-w-full whitespace-normal break-all">{account.pass}</Badge>
                    <Tooltip content={t('copy')}>
                      <IconButton label={t('copy')} onClick={() => copyText(`${ account.user }:${ account.pass }`, t)} icon={<Copy className="h-3.5 w-3.5" aria-hidden />} />
                    </Tooltip>
                    <span className="flex flex-wrap gap-1 border-s border-border ps-2">
                      <Tooltip content={`socks5://${ account.user }:${ account.pass }@${ dbInbound.address }:${ dbInbound.port }`}>
                        <Button size="sm" variant="secondary" onClick={() => copyText(`socks5://${ account.user }:${ account.pass }@${ dbInbound.address }:${ dbInbound.port }`, t)}>SOCKS5</Button>
                      </Tooltip>
                      <Tooltip content={`http://${ account.user }:${ account.pass }@${ dbInbound.address }:${ dbInbound.port }`}>
                        <Button size="sm" variant="secondary" onClick={() => copyText(`http://${ account.user }:${ account.pass }@${ dbInbound.address }:${ dbInbound.port }`, t)}>HTTP</Button>
                      </Tooltip>
                      <Tooltip content="https://t.me/socks?server=...&port=...&user=...&pass=...">
                        <Button size="sm" variant="secondary" onClick={() => copyText(`https://t.me/socks?server=${ encodeURIComponent(dbInbound.address) }&port=${ dbInbound.port }&user=${ encodeURIComponent(account.user) }&pass=${ encodeURIComponent(account.pass) }`, t)}>Telegram</Button>
                      </Tooltip>
                    </span>
                  </span>
                </InfoRow>
              ))}
            </>
          )}
          {inbound.settings.auth === 'noauth' && (
            <InfoRow label={t('copy')}>
              <span className="flex flex-wrap gap-1">
                <Tooltip content={`socks5://${ dbInbound.address }:${ dbInbound.port }`}>
                  <Button size="sm" variant="secondary" onClick={() => copyText(`socks5://${ dbInbound.address }:${ dbInbound.port }`, t)}>SOCKS5</Button>
                </Tooltip>
                <Tooltip content={`http://${ dbInbound.address }:${ dbInbound.port }`}>
                  <Button size="sm" variant="secondary" onClick={() => copyText(`http://${ dbInbound.address }:${ dbInbound.port }`, t)}>HTTP</Button>
                </Tooltip>
                <Tooltip content="https://t.me/socks?server=...&port=...">
                  <Button size="sm" variant="secondary" onClick={() => copyText(`https://t.me/socks?server=${ encodeURIComponent(dbInbound.address) }&port=${ dbInbound.port }`, t)}>Telegram</Button>
                </Tooltip>
              </span>
            </InfoRow>
          )}
        </div>
      )}

      {dbInbound.isHTTP && Array.isArray(inbound.settings?.accounts) && (inbound.settings!.accounts as unknown[]).length > 0 && (
        <div className="mt-2.5 flex flex-col">
          {(inbound.settings!.accounts as { user: string; pass: string }[]).map((account, idx) => (
            <InfoRow key={idx} label={`${ t('username') } #${ idx + 1 }`}>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge variant="success" className="max-w-full whitespace-normal break-all">{account.user}</Badge>
                <span className="font-semibold opacity-55">:</span>
                <Badge variant="neutral" className="max-w-full whitespace-normal break-all">{account.pass}</Badge>
                <Tooltip content={t('copy')}>
                  <IconButton label={t('copy')} onClick={() => copyText(`${ account.user }:${ account.pass }`, t)} icon={<Copy className="h-3.5 w-3.5" aria-hidden />} />
                </Tooltip>
              </span>
            </InfoRow>
          ))}
        </div>
      )}

      {dbInbound.isWireguard && inbound.settings && (
        <>
          <div className="mt-2.5 flex flex-col">
            <InfoRow label={t('pages.xray.wireguard.secretKey')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.settings.secretKey as string}</Badge></InfoRow>
            <InfoRow label={t('pages.xray.wireguard.publicKey')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{inbound.settings.pubKey as string}</Badge></InfoRow>
            <InfoRow label={t('pages.inbounds.info.mtu')}><Badge variant="neutral">{inbound.settings.mtu as number}</Badge></InfoRow>
            <InfoRow label={t('pages.inbounds.info.noKernelTun')}>
              <Badge variant={inbound.settings.noKernelTun ? 'success' : 'neutral'}>
                {String(inbound.settings.noKernelTun)}
              </Badge>
            </InfoRow>
          </div>
          {Array.isArray(inbound.settings.peers) && (inbound.settings.peers as { privateKey: string; publicKey: string; psk: string; allowedIPs?: string[]; keepAlive?: number }[]).map((peer, idx) => (
            <Fragment key={idx}>
              <SectionDivider>{t('pages.inbounds.info.peerNumber', { n: idx + 1 })}</SectionDivider>
              <div className="flex flex-col">
                <InfoRow label={t('pages.xray.wireguard.secretKey')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{peer.privateKey}</Badge></InfoRow>
                <InfoRow label={t('pages.xray.wireguard.publicKey')}><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{peer.publicKey}</Badge></InfoRow>
                <InfoRow label="PSK"><Badge variant="neutral" className="max-w-full whitespace-normal break-all">{peer.psk}</Badge></InfoRow>
                <InfoRow label={t('pages.xray.wireguard.allowedIPs')}>
                  <span className="flex flex-wrap gap-1">
                    {(peer.allowedIPs || []).map((ip, j) => (
                      <Badge key={`wg-ip-${ idx }-${ j }`} variant="neutral" className="max-w-full whitespace-normal break-all">{ip}</Badge>
                    ))}
                  </span>
                </InfoRow>
                <InfoRow label={t('pages.inbounds.info.keepAlive')}><Badge variant="neutral">{peer.keepAlive}</Badge></InfoRow>
              </div>
              {wireguardConfigs[idx] && (
                <LinkPanel
                  title={t('pages.inbounds.info.peerNumberConfig', { n: idx + 1 })}
                  value={wireguardConfigs[idx]}
                  copyLabel={t('copy')}
                  onCopy={() => copyText(wireguardConfigs[idx], t)}
                  extra={(
                    <Tooltip content={t('download')}>
                      <IconButton label={t('download')} onClick={() => downloadText(wireguardConfigs[idx], `peer-${ idx + 1 }.conf`)} icon={<Download className="h-3.5 w-3.5" aria-hidden />} />
                    </Tooltip>
                  )}
                />
              )}
              {wireguardLinks[idx] && (
                <LinkPanel title={`Peer ${ idx + 1 } link`} value={wireguardLinks[idx]} copyLabel={t('copy')} onCopy={() => copyText(wireguardLinks[idx], t)} />
              )}
            </Fragment>
          ))}
        </>
      )}

      {dbInbound.isSS && !inbound.isSSMultiUser && links.length > 0 && (
        <>
          <SectionDivider>{t('pages.inbounds.copyLink')}</SectionDivider>
          {links.map((link, idx) => (
            <LinkPanel key={idx} title={link.remark || `Link ${ idx + 1 }`} value={link.link} copyLabel={t('copy')} onCopy={() => copyText(link.link, t)} />
          ))}
        </>
      )}
    </>
    );

    const tabItems: { key: string; label: string }[] = [];
    if (showClientTab)
    {
        tabItems.push({ key: 'client', label: t('pages.inbounds.client') });
    }
    tabItems.push({ key: 'inbound', label: t('pages.xray.rules.inbound') });

    return (
    <Modal open={open} onClose={onClose} title={t('pages.inbounds.inboundInfo')} size="lg">
      <Tabs tabs={tabItems} value={activeTab} onChange={setActiveTab} variant="underline" />
      <div className="pt-4">{activeTab === 'client' && showClientTab ? clientTab : inboundTab}</div>
    </Modal>
    );
}
