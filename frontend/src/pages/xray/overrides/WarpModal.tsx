import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { ChevronDown, Plug, RefreshCw, Trash2, Plus } from 'lucide-react';

import { HttpUtil, SizeFormatter, ObjectUtil, Wireguard } from '@/utils';
import { Alert, Badge, Button, Input, Label, Modal } from '@/components/ui';

interface WarpModalProps {
  open: boolean;
  templateSettings: { outbounds?: { tag?: string }[] } | null;
  onClose: () => void;
  onAddOutbound: (outbound: Record<string, unknown>) => void;
  onResetOutbound: (payload: { index: number; outbound: Record<string, unknown> }) => void;
  onRemoveOutbound: (tag: string) => void;
}

interface WarpData {
  access_token?: string;
  device_id?: string;
  license_key?: string;
  private_key?: string;
  client_id?: string;
}

interface WarpConfig {
  name?: string;
  model?: string;
  enabled?: boolean;
  config?: {
    client_id?: string;
    interface?: { addresses?: { v4?: string; v6?: string } };
    peers?: { public_key?: string; endpoint?: { host?: string } }[];
  };
  account?: {
    account_type?: string;
    role?: string;
    premium_data?: number;
    quota?: number;
    usage?: number;
  };
}

function addressesFor(addrs: { v4?: string; v6?: string }): string[]
{
    const out: string[] = [];
    if (addrs.v4)
    {
        out.push(`${ addrs.v4 }/32`);
    }
    if (addrs.v6)
    {
        out.push(`${ addrs.v6 }/128`);
    }
    return out;
}

function reservedFor(clientId?: string): number[]
{
    if (!clientId)
    {
        return [];
    }
    const decoded = atob(clientId);
    const out: number[] = [];
    for (let i = 0; i < decoded.length; i += 1)
    {
        out.push(decoded.charCodeAt(i));
    }
    return out;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode })
{
    return (
    <div className="flex gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0 even:bg-foreground/[0.04]">
      <span className="w-32 shrink-0 font-medium">{label}</span>
      <span className="break-all font-mono">{value}</span>
    </div>
    );
}

export default function WarpModal({
    open,
    templateSettings,
    onClose,
    onAddOutbound,
    onResetOutbound,
    onRemoveOutbound
}: WarpModalProps)
{
    const { t } = useTranslation();
    const [messageApi, messageContextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [warpData, setWarpData] = useState<WarpData | null>(null);
    const [warpConfig, setWarpConfig] = useState<WarpConfig | null>(null);
    const [warpPlus, setWarpPlus] = useState('');
    const [licenseError, setLicenseError] = useState('');
    const [stagedOutbound, setStagedOutbound] = useState<Record<string, unknown> | null>(null);

    const warpOutboundIndex = useMemo(() =>
    {
        const list = templateSettings?.outbounds;
        if (!list)
        {
            return -1;
        }
        return list.findIndex((o) => o?.tag === 'warp');
    }, [templateSettings?.outbounds]);

    const collectConfig = useCallback((data: WarpData | null, config: WarpConfig | null) =>
    {
        const cfg = config?.config;
        if (!cfg?.peers?.length)
        {
            return;
        }
        const peer = cfg.peers[0];
        setStagedOutbound({
            tag: 'warp',
            protocol: 'wireguard',
            settings: {
                mtu: 1420,
                secretKey: data?.private_key,
                address: addressesFor(cfg.interface?.addresses || {}),
                reserved: reservedFor(cfg.client_id ?? data?.client_id),
                domainStrategy: 'ForceIP',
                peers: [{ publicKey: peer.public_key, endpoint: peer.endpoint?.host }],
                noKernelTun: false
            }
        });
    }, []);

    const fetchData = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/warp/data');
            if (msg?.success)
            {
                const raw = msg.obj;
                setWarpData(raw && raw.length > 0 ? JSON.parse(raw) : null);
            }
        }
        finally
        {
            setLoading(false);
        }
    }, []);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        setWarpConfig(null);
        setStagedOutbound(null);
        setLicenseError('');
        fetchData();
    }, [open, fetchData]);

    async function register()
    {
        setLoading(true);
        try
        {
            const keys = Wireguard.generateKeypair();
            const msg = await HttpUtil.post<string>('/panel/xray/warp/reg', keys);
            if (msg?.success && msg.obj)
            {
                const resp = JSON.parse(msg.obj);
                setWarpData(resp.data);
                setWarpConfig(resp.config);
                collectConfig(resp.data, resp.config);
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function getConfig()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/warp/config');
            if (msg?.success && msg.obj)
            {
                const parsed = JSON.parse(msg.obj);
                setWarpConfig(parsed);
                collectConfig(warpData, parsed);
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function updateLicense()
    {
        if (warpPlus.length < 26)
        {
            return;
        }
        setLoading(true);
        setLicenseError('');
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/warp/license', { license: warpPlus });
            if (msg?.success && msg.obj)
            {
                setWarpData(JSON.parse(msg.obj));
                setWarpConfig(null);
                setWarpPlus('');
            }
            else
            {
                setLicenseError(msg?.msg || t('pages.xray.warp.licenseError'));
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function delConfig()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post('/panel/xray/warp/del');
            if (msg?.success)
            {
                setWarpData(null);
                setWarpConfig(null);
                setStagedOutbound(null);
                onRemoveOutbound('warp');
                onClose();
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    function addOutbound()
    {
        if (!stagedOutbound)
        {
            messageApi.warning(t('pages.xray.warp.fetchFirst'));
            return;
        }
        onAddOutbound(stagedOutbound);
        onClose();
    }
    function resetOutbound()
    {
        if (!stagedOutbound)
        {
            return;
        }
        onResetOutbound({ index: warpOutboundIndex, outbound: stagedOutbound });
        onClose();
    }

    const hasWarp = !ObjectUtil.isEmpty(warpData);
    const hasConfig = !ObjectUtil.isEmpty(warpConfig);

    return (
    <>
      {messageContextHolder}
      <Modal open={open} title="Cloudflare WARP" onClose={onClose}>
        {!hasWarp ? (
          <Button loading={loading} onClick={register}>
            <Plug className="h-4 w-4" aria-hidden />
            {t('pages.xray.warp.createAccount')}
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-border">
              <DataRow label={t('pages.xray.warp.accessToken')} value={warpData?.access_token} />
              <DataRow label={t('pages.xray.warp.deviceId')} value={warpData?.device_id} />
              <DataRow label={t('pages.xray.warp.licenseKey')} value={warpData?.license_key} />
              <DataRow label={t('pages.xray.warp.privateKey')} value={warpData?.private_key} />
            </div>

            <Button variant="danger" className="self-start" loading={loading} onClick={delConfig}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('pages.xray.warp.deleteAccount')}
            </Button>

            <div className="border-t border-border pt-3 text-sm font-medium">{t('pages.xray.warp.settings')}</div>

            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
                {t('pages.xray.warp.licenseKeyLabel')}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="flex flex-col gap-2 border-t border-border p-3">
                <Label htmlFor="warp-license">{t('pages.xray.warp.key')}</Label>
                <Input
                  id="warp-license"
                  value={warpPlus}
                  placeholder={t('pages.xray.warp.keyPlaceholder')}
                  onChange={(e) =>
                  {
                      setWarpPlus(e.target.value);
                      setLicenseError('');
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={warpPlus.length < 26} loading={loading} onClick={updateLicense}>
                    {t('update')}
                  </Button>
                  {licenseError && (
                    <Alert variant="danger" className="flex-1" title={licenseError} />
                  )}
                </div>
              </div>
            </details>

            <div className="border-t border-border pt-3 text-sm font-medium">{t('pages.xray.warp.accountInfo')}</div>
            <Button className="self-start" loading={loading} onClick={getConfig}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('refresh')}
            </Button>

            {hasConfig && (
              <>
                <div className="overflow-hidden rounded-lg border border-border">
                  <DataRow label={t('pages.xray.warp.deviceName')} value={warpConfig?.name} />
                  <DataRow label={t('pages.xray.warp.deviceModel')} value={warpConfig?.model} />
                  <DataRow label={t('pages.xray.warp.deviceEnabled')} value={String(warpConfig?.enabled)} />
                  {warpConfig?.account && (
                    <>
                      <DataRow label={t('pages.xray.warp.accountType')} value={warpConfig.account.account_type} />
                      <DataRow label={t('pages.xray.warp.role')} value={warpConfig.account.role} />
                      <DataRow
                        label={t('pages.xray.warp.warpPlusData')}
                        value={SizeFormatter.sizeFormat(warpConfig.account.premium_data)}
                      />
                      <DataRow
                        label={t('pages.xray.warp.quota')}
                        value={SizeFormatter.sizeFormat(warpConfig.account.quota)}
                      />
                      {warpConfig.account.usage != null && (
                        <DataRow
                          label={t('pages.xray.warp.usage')}
                          value={SizeFormatter.sizeFormat(warpConfig.account.usage)}
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="border-t border-border pt-3 text-sm font-medium">
                  {t('pages.xray.outbound.outboundStatus')}
                </div>
                {warpOutboundIndex >= 0 ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{t('enabled')}</Badge>
                    <Button variant="danger" loading={loading} onClick={resetOutbound}>
                      {t('reset')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{t('disabled')}</Badge>
                    <Button loading={loading} onClick={addOutbound}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t('pages.xray.warp.addOutbound')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
    );
}
