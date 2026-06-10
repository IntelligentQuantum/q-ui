import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Database,
    FlaskConical,
    List,
    Plus,
    Settings,
    ScrollText,
    Trash2
} from 'lucide-react';

import {
    Button,
    Input,
    SearchInput,
    Select,
    SettingListItem,
    Switch,
    Table,
    Tabs,
    confirm
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import DnsServerModal from './DnsServerModal';
import type { DnsServerValue } from './DnsServerModal';
import DnsPresetsModal from './DnsPresetsModal';
import type { XraySettingsValue, SetTemplate } from '@/hooks/useXraySetting';

import { STRATEGIES, DEFAULT_FAKEDNS } from './helpers';
import type { DnsConfig, HostRow, FakednsRow } from './types';
import { useDnsServerColumns, useFakednsColumns } from './useDnsColumns';

interface DnsTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
}

// Mobile collapses tab labels to icons; desktop shows icon + text.
function tabLabel(icon: ReactNode, text: ReactNode, iconsOnly: boolean): ReactNode
{
    if (iconsOnly)
    {
        return <span aria-label={typeof text === 'string' ? text : undefined}>{icon}</span>;
    }
    return (
    <span className="inline-flex items-center gap-2">
      {icon}
      <span>{text}</span>
    </span>
    );
}

function EmptyState({ description, children }: { description: ReactNode; children?: ReactNode })
{
    return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
    );
}

export default function DnsTab({ templateSettings, setTemplateSettings }: DnsTabProps)
{
    const { t } = useTranslation();
    const { isMobile } = useMediaQuery();
    const [activeTab, setActiveTab] = useState('1');
    const [hostsList, setHostsList] = useState<HostRow[]>([]);
    const [serverModalOpen, setServerModalOpen] = useState(false);
    const [editingServer, setEditingServer] = useState<DnsServerValue | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [presetsModalOpen, setPresetsModalOpen] = useState(false);

    const dns = (templateSettings?.dns as DnsConfig | undefined) ?? null;
    const dnsEnabled = !!dns;

    const mutate = useCallback(
        (mutator: (next: XraySettingsValue) => void) =>
        {
            setTemplateSettings((prev) =>
            {
                if (!prev)
                {
                    return prev;
                }
                const clone = JSON.parse(JSON.stringify(prev)) as XraySettingsValue;
                mutator(clone);
                return clone;
            });
        },
        [setTemplateSettings]
    );

    function toggleDNS(enabled: boolean)
    {
        mutate((next) =>
        {
            if (enabled)
            {
                (next as { dns?: DnsConfig }).dns = {
                    tag: 'dns_inbound',
                    queryStrategy: 'UseIP',
                    disableCache: false,
                    disableFallback: false,
                    disableFallbackIfMatch: false,
                    useSystemHosts: false,
                    enableParallelQuery: false,
                    serveStale: false,
                    serveExpiredTTL: 0,
                    hosts: {},
                    servers: []
                };
                next.fakedns = null;
            }
            else
            {
                delete next.dns;
                delete next.fakedns;
            }
        });
    }

    useEffect(() =>
    {
        if (!dns)
        {
            setHostsList([]);
            return;
        }
        const src = dns.hosts || {};
        setHostsList(
            Object.entries(src).map(([domain, val]) => ({
                domain,
                values: Array.isArray(val) ? [...val] : [String(val)]
            }))
        );
    }, [dnsEnabled]);

    function syncHosts(next: HostRow[])
    {
        setHostsList(next);
        mutate((tt) =>
        {
            if (!tt.dns)
            {
                return;
            }
            const obj: Record<string, string | string[]> = {};
            for (const row of next)
            {
                if (!row.domain)
                {
                    continue;
                }
                const vals = (row.values || []).filter(Boolean);
                if (vals.length === 0)
                {
                    continue;
                }
                obj[row.domain] = vals.length === 1 ? vals[0] : vals;
            }
            if (Object.keys(obj).length > 0)
            {
                (tt.dns as DnsConfig).hosts = obj;
            }
            else if ('hosts' in (tt.dns as DnsConfig))
            {
                delete (tt.dns as DnsConfig).hosts;
            }
        });
    }

    function setDnsField<K extends keyof DnsConfig>(key: K, value: DnsConfig[K], omit = false)
    {
        mutate((tt) =>
        {
            if (!tt.dns)
            {
                return;
            }
            if (omit && (value == null || (typeof value === 'string' && value.trim() === '')))
            {
                delete (tt.dns as Record<string, unknown>)[key as string];
            }
            else
            {
                (tt.dns as Record<string, unknown>)[key as string] = value;
            }
        });
    }

    const dnsServers = useMemo(() =>
    {
        const list = dns?.servers || [];
        return list.map((server, idx) => ({ key: idx, server }));
    }, [dns?.servers]);

    const [serverSearch, setServerSearch] = useState('');
    const filteredDnsServers = useMemo(() =>
    {
        const needle = serverSearch.trim().toLowerCase();
        if (!needle)
        {
            return dnsServers;
        }
        return dnsServers.filter((r) => JSON.stringify(r.server).toLowerCase().includes(needle));
    }, [dnsServers, serverSearch]);

    const dnsColumns = useDnsServerColumns({ openEditServer, deleteServer });

    function openAddServer()
    {
        setEditingServer(null);
        setEditingIndex(null);
        setServerModalOpen(true);
    }
    function openEditServer(idx: number)
    {
        setEditingServer((dns?.servers || [])[idx] || null);
        setEditingIndex(idx);
        setServerModalOpen(true);
    }
    function onServerConfirm(value: DnsServerValue)
    {
        mutate((tt) =>
        {
            if (!tt.dns)
            {
                return;
            }
            const cfg = tt.dns as DnsConfig;
            if (!Array.isArray(cfg.servers))
            {
                cfg.servers = [];
            }
            if (editingIndex == null)
            {
                cfg.servers.push(value);
            }
            else
            {
                cfg.servers[editingIndex] = value;
            }
        });
        setServerModalOpen(false);
    }
    function deleteServer(idx: number)
    {
        mutate((tt) =>
        {
            const cfg = tt.dns as DnsConfig | undefined;
            if (cfg?.servers)
            {
                cfg.servers.splice(idx, 1);
            }
        });
    }
    async function clearAllServers()
    {
        const ok = await confirm({
            title: t('pages.xray.dns.clearAllTitle'),
            description: t('pages.xray.dns.clearAllConfirm'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            mutate((tt) =>
            {
                if (tt.dns)
                {
                    (tt.dns as DnsConfig).servers = [];
                }
            });
        }
    }
    function onPresetInstall(servers: string[])
    {
        mutate((tt) =>
        {
            if (tt.dns)
            {
                (tt.dns as DnsConfig).servers = servers;
            }
        });
        setPresetsModalOpen(false);
    }

    const fakeDnsList = useMemo<{ key: number; ipPool: string; poolSize: number }[]>(() =>
    {
        const list = Array.isArray(templateSettings?.fakedns)
            ? (templateSettings?.fakedns as FakednsRow[])
            : [];
        return list.map((entry, idx) => ({ key: idx, ...entry }));
    }, [templateSettings?.fakedns]);

    const fakednsColumns = useFakednsColumns({ deleteFakedns, updateFakednsField });

    function addFakedns()
    {
        mutate((tt) =>
        {
            if (!Array.isArray(tt.fakedns))
            {
                tt.fakedns = [];
            }
            (tt.fakedns as FakednsRow[]).push(DEFAULT_FAKEDNS());
        });
    }
    function deleteFakedns(idx: number)
    {
        mutate((tt) =>
        {
            const list = tt.fakedns as FakednsRow[] | undefined;
            if (!list)
            {
                return;
            }
            list.splice(idx, 1);
            if (list.length === 0)
            {
                tt.fakedns = null;
            }
        });
    }
    function updateFakednsField(idx: number, field: 'ipPool' | 'poolSize', value: string | number)
    {
        mutate((tt) =>
        {
            const list = tt.fakedns as FakednsRow[] | undefined;
            if (!list?.[idx])
            {
                return;
            }
            (list[idx] as unknown as Record<string, unknown>)[field] = value;
        });
    }

    const tabs = useMemo(() =>
    {
        const out = [
            { key: '1', label: tabLabel(<Settings className="h-4 w-4" aria-hidden />, t('pages.xray.generalConfigs'), isMobile) }
        ];
        if (dnsEnabled)
        {
            out.push({ key: 'hosts', label: tabLabel(<ScrollText className="h-4 w-4" aria-hidden />, t('pages.xray.dns.hosts'), isMobile) });
            out.push({ key: '2', label: tabLabel(<Database className="h-4 w-4" aria-hidden />, 'DNS', isMobile) });
            out.push({ key: '3', label: tabLabel(<FlaskConical className="h-4 w-4" aria-hidden />, 'Fake DNS', isMobile) });
        }
        return out;
    }, [t, isMobile, dnsEnabled]);

    // Reset to the general tab when DNS is disabled (the other tabs vanish).
    useEffect(() =>
    {
        if (!dnsEnabled && activeTab !== '1')
        {
            setActiveTab('1');
        }
    }, [dnsEnabled, activeTab]);

    const generalBody = (
    <>
      <SettingListItem
        paddings="small"
        title={t('pages.xray.dns.enable')}
        description={t('pages.xray.dns.enableDesc')}
        control={<Switch checked={dnsEnabled} onCheckedChange={toggleDNS} />}
      />
      {dnsEnabled && (
        <>
          <SettingListItem
            paddings="small"
            title={t('pages.xray.dns.tag')}
            description={t('pages.xray.dns.tagDesc')}
            control={
              <Input
                value={dns?.tag ?? 'dns_inbound'}
                onChange={(e) => setDnsField('tag', e.target.value)}
              />
            }
          />
          <SettingListItem
            paddings="small"
            title={t('pages.xray.dns.clientIp')}
            description={t('pages.xray.dns.clientIpDesc')}
            control={
              <Input
                value={dns?.clientIp ?? ''}
                onChange={(e) => setDnsField('clientIp', e.target.value, true)}
              />
            }
          />
          <SettingListItem
            paddings="small"
            title={t('pages.xray.dns.strategy')}
            description={t('pages.xray.dns.strategyDesc')}
            control={
              <Select
                value={dns?.queryStrategy ?? 'UseIP'}
                options={STRATEGIES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setDnsField('queryStrategy', v as DnsConfig['queryStrategy'])}
              />
            }
          />
          {(
            [
                ['disableCache', 'pages.xray.dns.disableCache', 'pages.xray.dns.disableCacheDesc'],
                ['disableFallback', 'pages.xray.dns.disableFallback', 'pages.xray.dns.disableFallbackDesc'],
                ['disableFallbackIfMatch', 'pages.xray.dns.disableFallbackIfMatch', 'pages.xray.dns.disableFallbackIfMatchDesc'],
                ['enableParallelQuery', 'pages.xray.dns.enableParallelQuery', 'pages.xray.dns.enableParallelQueryDesc'],
                ['useSystemHosts', 'pages.xray.dns.useSystemHosts', 'pages.xray.dns.useSystemHostsDesc'],
                ['serveStale', 'pages.xray.dns.serveStale', 'pages.xray.dns.serveStaleDesc']
            ] as const
          ).map(([field, titleKey, descKey]) => (
            <SettingListItem
              key={field}
              paddings="small"
              title={t(titleKey)}
              description={t(descKey)}
              control={
                <Switch
                  checked={!!dns?.[field]}
                  onCheckedChange={(v) => setDnsField(field as keyof DnsConfig, v as never)}
                />
              }
            />
          ))}
          <SettingListItem
            paddings="small"
            title={t('pages.xray.dns.serveExpiredTTL')}
            description={t('pages.xray.dns.serveExpiredTTLDesc')}
            control={
              <Input
                type="number"
                min={0}
                step={60}
                value={dns?.serveExpiredTTL ?? 0}
                onChange={(e) => setDnsField('serveExpiredTTL', Number(e.target.value) || 0)}
              />
            }
          />
        </>
      )}
    </>
    );

    const hostsBody = hostsList.length === 0 ? (
    <EmptyState description={t('pages.xray.dns.hostsEmpty')}>
      <Button onClick={() => syncHosts([...hostsList, { domain: '', values: [] }])}>
        <Plus className="h-4 w-4" aria-hidden />
        {t('pages.xray.dns.hostsAdd')}
      </Button>
    </EmptyState>
    ) : (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={() => syncHosts([...hostsList, { domain: '', values: [] }])}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.hostsAdd')}
        </Button>
      </div>
      {hostsList.map((row, idx) => (
        <div key={`h${ idx }`} className="flex flex-wrap items-center gap-2">
          <Input
            value={row.domain}
            placeholder={t('pages.xray.dns.hostsDomain')}
            className="min-w-[200px] flex-[1_1_200px]"
            onChange={(e) =>
            {
                const next = hostsList.map((r, i) => (i === idx ? { ...r, domain: e.target.value } : r));
                syncHosts(next);
            }}
          />
          <Input
            value={row.values.join(', ')}
            placeholder={t('pages.xray.dns.hostsValues')}
            className="min-w-[260px] flex-[2_1_300px]"
            onChange={(e) =>
            {
                const values = e.target.value
                    .split(/[,\s]+/)
                    .map((v) => v.trim())
                    .filter(Boolean);
                const next = hostsList.map((r, i) => (i === idx ? { ...r, values } : r));
                syncHosts(next);
            }}
          />
          <Button
            aria-label={t('delete')}
            variant="secondary"
            size="icon"
            onClick={() => syncHosts(hostsList.filter((_, i) => i !== idx))}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
    );

    const serversBody = dnsServers.length === 0 ? (
    <EmptyState description={t('emptyDnsDesc')}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={openAddServer}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.add')}
        </Button>
        <Button variant="secondary" onClick={() => setPresetsModalOpen(true)}>
          <List className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.usePreset')}
        </Button>
      </div>
    </EmptyState>
    ) : (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openAddServer}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.add')}
        </Button>
        <Button variant="secondary" onClick={() => setPresetsModalOpen(true)}>
          <List className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.usePreset')}
        </Button>
        <Button variant="danger" onClick={clearAllServers}>
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('pages.xray.dns.clearAll')}
        </Button>
        <SearchInput
          className="w-full max-w-[260px] sm:ms-auto sm:w-auto"
          aria-label={t('search')}
          placeholder={t('search')}
          value={serverSearch}
          onChange={(e) => setServerSearch(e.target.value)}
        />
      </div>
      <Table columns={dnsColumns} data={filteredDnsServers} rowKey={(r) => String(r.key)} pageSize={15} />
    </div>
    );

    const fakednsBody = fakeDnsList.length === 0 ? (
    <EmptyState description={t('emptyFakeDnsDesc')}>
      <Button onClick={addFakedns}>
        <Plus className="h-4 w-4" aria-hidden />
        {t('pages.xray.fakedns.add')}
      </Button>
    </EmptyState>
    ) : (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={addFakedns}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.xray.fakedns.add')}
        </Button>
      </div>
      <Table columns={fakednsColumns} data={fakeDnsList} rowKey={(r) => String(r.key)} pageSize={15} />
    </div>
    );

    return (
    <>
      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
      <div className="pt-4">
        {activeTab === '1' && generalBody}
        {activeTab === 'hosts' && dnsEnabled && hostsBody}
        {activeTab === '2' && dnsEnabled && serversBody}
        {activeTab === '3' && dnsEnabled && fakednsBody}
      </div>
      <DnsServerModal
        open={serverModalOpen}
        server={editingServer}
        isEdit={editingIndex != null}
        onClose={() => setServerModalOpen(false)}
        onConfirm={onServerConfirm}
      />
      <DnsPresetsModal
        open={presetsModalOpen}
        onClose={() => setPresetsModalOpen(false)}
        onInstall={onPresetInstall}
      />
    </>
    );
}
