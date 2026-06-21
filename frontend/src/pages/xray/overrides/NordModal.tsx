import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { LogIn, Save } from 'lucide-react';

import { HttpUtil } from '@/utils';
import { Badge, Button, Input, Label, Modal, Select, Tabs } from '@/components/ui';

interface NordModalProps {
  open: boolean;
  templateSettings: { outbounds?: { tag?: string }[] } | null;
  onClose: () => void;
  onAddOutbound: (outbound: Record<string, unknown>) => void;
  onResetOutbound: (payload: { index: number; outbound: Record<string, unknown>; oldTag?: string; newTag: string }) => void;
  onRemoveOutbound: (index: number) => void;
  onRemoveRoutingRules: (payload: { prefix: string }) => void;
}

interface NordData {
  token?: string;
  private_key?: string;
}

interface Country {
  id: number;
  name: string;
  code: string;
}

interface City {
  id: number;
  name: string;
}

interface NordServer {
  id: number;
  name: string;
  hostname: string;
  station: string;
  load: number;
  technologies?: { id: number; metadata?: { name: string; value: string }[] }[];
  location_ids?: number[];
  cityId?: number | null;
  cityName?: string;
}

function loadVariant(load: number): 'success' | 'warning' | 'danger'
{
    if (load < 30)
    {
        return 'success';
    }
    if (load < 70)
    {
        return 'warning';
    }
    return 'danger';
}

export default function NordModal({
    open,
    templateSettings,
    onClose,
    onAddOutbound,
    onResetOutbound,
    onRemoveOutbound,
    onRemoveRoutingRules
}: NordModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [authTab, setAuthTab] = useState('token');
    const [loading, setLoading] = useState(false);
    const [nordData, setNordData] = useState<NordData | null>(null);
    const [token, setToken] = useState('');
    const [manualKey, setManualKey] = useState('');
    const [countries, setCountries] = useState<Country[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [servers, setServers] = useState<NordServer[]>([]);
    const [countryId, setCountryId] = useState<number | null>(null);
    const [cityId, setCityId] = useState<number | null>(null);
    const [serverId, setServerId] = useState<number | null>(null);

    const nordOutboundIndex = useMemo(() =>
    {
        const list = templateSettings?.outbounds;
        if (!list)
        {
            return -1;
        }
        return list.findIndex((o) => o?.tag?.startsWith?.('nord-'));
    }, [templateSettings?.outbounds]);

    const filteredServers = useMemo(() =>
    {
        if (!cityId)
        {
            return servers;
        }
        return servers.filter((s) => s.cityId === cityId);
    }, [cityId, servers]);

    useEffect(() =>
    {
        setServerId(filteredServers.length > 0 ? filteredServers[0].id : null);
    }, [filteredServers]);

    const fetchCountries = useCallback(async () =>
    {
        const msg = await HttpUtil.post<string>('/panel/xray/nord/countries');
        if (msg?.success && msg.obj)
        {
            setCountries(JSON.parse(msg.obj));
        }
    }, []);

    const fetchData = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/nord/data');
            if (msg?.success)
            {
                const next = msg.obj ? JSON.parse(msg.obj) : null;
                setNordData(next);
                if (next)
                {
                    await fetchCountries();
                }
            }
        }
        finally
        {
            setLoading(false);
        }
    }, [fetchCountries]);

    useEffect(() =>
    {
        if (open)
        {
            fetchData();
        }
    }, [open, fetchData]);

    async function login()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/nord/reg', { token });
            if (msg?.success && msg.obj)
            {
                setNordData(JSON.parse(msg.obj));
                await fetchCountries();
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function saveKey()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/nord/setKey', { key: manualKey });
            if (msg?.success && msg.obj)
            {
                setNordData(JSON.parse(msg.obj));
                await fetchCountries();
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function logout()
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post('/panel/xray/nord/del');
            if (msg?.success)
            {
                onRemoveOutbound(nordOutboundIndex);
                onRemoveRoutingRules({ prefix: 'nord-' });
                setNordData(null);
                setToken('');
                setManualKey('');
                setCountries([]);
                setCities([]);
                setServers([]);
                setCountryId(null);
                setCityId(null);
                setServerId(null);
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    async function fetchServers(newCountryId: number)
    {
        setCountryId(newCountryId);
        setLoading(true);
        setServers([]);
        setCities([]);
        setServerId(null);
        setCityId(null);
        try
        {
            const msg = await HttpUtil.post<string>('/panel/xray/nord/servers', { countryId: newCountryId });
            if (!msg?.success || !msg.obj)
            {
                return;
            }
            const data = JSON.parse(msg.obj);
            const locations = data.locations || [];
            const locToCity: Record<number, City> = {};
            const citiesMap = new Map<number, City>();
            for (const loc of locations)
            {
                if (loc.country?.city)
                {
                    citiesMap.set(loc.country.city.id, loc.country.city);
                    locToCity[loc.id] = loc.country.city;
                }
            }
            setCities(Array.from(citiesMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            const next: NordServer[] = (data.servers || [])
                .map((s: NordServer) =>
                {
                    const firstLocId = (s.location_ids || [])[0];
                    const city = firstLocId != null ? locToCity[firstLocId] : null;
                    return { ...s, cityId: city?.id || null, cityName: city?.name || 'Unknown' };
                })
                .sort((a: NordServer, b: NordServer) => a.load - b.load);
            setServers(next);
            if (next.length === 0)
            {
                messageApi.warning(t('pages.xray.nord.noServers'));
            }
        }
        finally
        {
            setLoading(false);
        }
    }

    function buildNordOutbound(): Record<string, unknown> | null
    {
        const server = servers.find((s) => s.id === serverId);
        if (!server)
        {
            return null;
        }
        const tech = server.technologies?.find((tt) => tt.id === 35);
        const publicKey = tech?.metadata?.find((m) => m.name === 'public_key')?.value;
        if (!publicKey)
        {
            messageApi.error(t('pages.xray.nord.noPublicKey'));
            return null;
        }
        return {
            tag: `nord-${ server.hostname }`,
            protocol: 'wireguard',
            settings: {
                secretKey: nordData?.private_key,
                address: ['10.5.0.2/32'],
                peers: [{ publicKey, endpoint: `${ server.station }:51820` }],
                noKernelTun: false
            }
        };
    }

    function addOutbound()
    {
        const ob = buildNordOutbound();
        if (!ob)
        {
            return;
        }
        onAddOutbound(ob);
        messageApi.success(t('pages.xray.nord.outboundAdded'));
        onClose();
    }

    function resetOutbound()
    {
        if (nordOutboundIndex === -1)
        {
            return;
        }
        const ob = buildNordOutbound();
        if (!ob)
        {
            return;
        }
        const oldTag = templateSettings?.outbounds?.[nordOutboundIndex]?.tag;
        onResetOutbound({
            index: nordOutboundIndex,
            outbound: ob,
            oldTag,
            newTag: ob.tag as string
        });
        messageApi.success(t('pages.xray.nord.outboundUpdated'));
        onClose();
    }

    const authTabs = [
        { key: 'token', label: t('pages.xray.nord.accessToken') },
        { key: 'key', label: t('pages.xray.nord.privateKey') }
    ];

    return (
    <>
      <Modal open={open} title="NordVPN NordLynx" onClose={onClose}>
        {nordData == null ? (
          <div className="flex flex-col gap-4">
            <Tabs tabs={authTabs} value={authTab} onChange={setAuthTab} />
            {authTab === 'token' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nord-token">{t('pages.xray.nord.accessToken')}</Label>
                <Input
                  id="nord-token"
                  value={token}
                  placeholder={t('pages.xray.nord.accessToken')}
                  onChange={(e) => setToken(e.target.value)}
                />
                <Button className="self-start" loading={loading} onClick={login}>
                  <LogIn className="h-4 w-4" aria-hidden />
                  {t('login')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nord-key">{t('pages.xray.nord.privateKey')}</Label>
                <Input
                  id="nord-key"
                  value={manualKey}
                  placeholder={t('pages.xray.nord.privateKey')}
                  onChange={(e) => setManualKey(e.target.value)}
                />
                <Button className="self-start" loading={loading} onClick={saveKey}>
                  <Save className="h-4 w-4" aria-hidden />
                  {t('save')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-border">
              {nordData.token && (
                <div className="flex gap-3 border-b border-border bg-foreground/[0.04] px-3 py-2 text-xs">
                  <span className="w-32 shrink-0 font-medium">{t('pages.xray.nord.accessToken')}</span>
                  <span className="break-all font-mono">{nordData.token}</span>
                </div>
              )}
              <div className="flex gap-3 px-3 py-2 text-xs">
                <span className="w-32 shrink-0 font-medium">{t('pages.xray.nord.privateKey')}</span>
                <span className="break-all font-mono">{nordData.private_key}</span>
              </div>
            </div>

            <Button variant="danger" className="self-start" loading={loading} onClick={logout}>
              {t('logout')}
            </Button>

            <div className="border-t border-border pt-3 text-sm font-medium">{t('pages.xray.warp.settings')}</div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t('pages.xray.outbound.country')}</Label>
                <Select
                  value={countryId != null ? String(countryId) : null}
                  onChange={(v) => fetchServers(Number(v))}
                  options={countries.map((c) => ({
                      value: String(c.id),
                      label: `${ c.name } (${ c.code })`
                  }))}
                />
              </div>

              {cities.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t('pages.xray.outbound.city')}</Label>
                  <Select
                    value={cityId != null ? String(cityId) : ''}
                    onChange={(v) => setCityId(v === '' ? null : Number(v))}
                    options={[
                        { value: '', label: t('pages.xray.outbound.allCities') },
                        ...cities.map((c) => ({ value: String(c.id), label: c.name }))
                    ]}
                  />
                </div>
              )}

              {filteredServers.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t('pages.xray.outbound.server')}</Label>
                  <Select
                    value={serverId != null ? String(serverId) : null}
                    onChange={(v) => setServerId(Number(v))}
                    options={filteredServers.map((s) => ({
                        value: String(s.id),
                        label: (
                        <span className="flex w-full items-center gap-2">
                          <span className="flex-1 truncate">
                            {s.cityName} - {s.name}
                          </span>
                          <Badge variant={loadVariant(s.load)}>{s.load}%</Badge>
                        </span>
                        )
                    }))}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3 text-sm font-medium">
              {t('pages.xray.outbound.outboundStatus')}
            </div>
            {nordOutboundIndex >= 0 ? (
              <div className="flex items-center gap-2">
                <Badge variant="success">{t('enabled')}</Badge>
                <Button variant="danger" loading={loading} onClick={resetOutbound}>
                  {t('reset')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="warning">{t('disabled')}</Badge>
                <Button disabled={!serverId} loading={loading} onClick={addOutbound}>
                  {t('pages.xray.warp.addOutbound')}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
    );
}
