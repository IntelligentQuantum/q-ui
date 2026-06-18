import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil } from 'lucide-react';

import {
    Badge,
    Button,
    DropdownMenu,
    SearchInput,
    Table,
    Tabs,
    Tooltip,
    confirm
} from '@/components/ui';
import type { Column } from '@/components/ui';
import BalancerFormModal from './BalancerFormModal';
import type { BalancerFormValue } from './BalancerFormModal';
import { JsonEditor } from '@/components/form';
import type { XraySettingsValue, SetTemplate } from '@/hooks/useXraySetting';
import type {
    BalancerObject,
    BalancerStrategySettings,
    BalancerStrategyType
} from '@/schemas/routing';

interface BalancersTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
  clientReverseTags: string[];
  isMobile: boolean;
}

type BalancerRecord = BalancerObject;

interface BalancerRow {
  key: number;
  tag: string;
  strategy: BalancerStrategyType;
  selector: string[];
  fallbackTag: string;
  settings?: BalancerStrategySettings;
}

const STRATEGY_LABELS: Record<string, string> = {
    random: 'Random',
    roundRobin: 'Round robin',
    leastLoad: 'Least load',
    leastPing: 'Least ping'
};

const DEFAULT_OBSERVATORY = Object.freeze({
    subjectSelector: [] as string[],
    probeURL: 'https://www.google.com/generate_204',
    probeInterval: '1m',
    enableConcurrency: true
});

const DEFAULT_BURST_OBSERVATORY = Object.freeze({
    subjectSelector: [] as string[],
    pingConfig: {
        destination: 'https://www.google.com/generate_204',
        interval: '1m',
        connectivity: 'http://connectivitycheck.platform.hicloud.com/generate_204',
        timeout: '5s',
        sampling: 2
    }
});

function collectSelectors(list: BalancerRecord[]): string[]
{
    const out = new Set<string>();
    list.forEach((b) => (b.selector || []).forEach((s) => s && out.add(s)));
    return [...out];
}

function syncObservatories(t: XraySettingsValue)
{
    const balancers = (t.routing?.balancers || []) as BalancerRecord[];

    const leastPings = balancers.filter((b) => b.strategy?.type === 'leastPing');
    if (leastPings.length > 0)
    {
        if (!t.observatory)
        {
            t.observatory = JSON.parse(JSON.stringify(DEFAULT_OBSERVATORY));
        }
        (t.observatory as { subjectSelector: string[] }).subjectSelector = collectSelectors(leastPings);
    }
    else
    {
        delete t.observatory;
    }

    const burstFeeders = balancers.filter((b) =>
    {
        const type = b.strategy?.type || 'random';
        return type === 'leastLoad' || type === 'random' || type === 'roundRobin';
    });
    if (burstFeeders.length > 0)
    {
        if (!t.burstObservatory)
        {
            t.burstObservatory = JSON.parse(JSON.stringify(DEFAULT_BURST_OBSERVATORY));
        }
        (t.burstObservatory as { subjectSelector: string[] }).subjectSelector = collectSelectors(burstFeeders);
    }
    else
    {
        delete t.burstObservatory;
    }
}

export default function BalancersTab({
    templateSettings,
    setTemplateSettings,
    clientReverseTags,
    isMobile
}: BalancersTabProps)
{
    const { t } = useTranslation();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBalancer, setEditingBalancer] = useState<BalancerFormValue | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const rows: BalancerRow[] = useMemo(() =>
    {
        const list = (templateSettings?.routing?.balancers || []) as BalancerRecord[];
        return list.map((b, idx) => ({
            key: idx,
            tag: b.tag || '',
            strategy: (b.strategy?.type ?? 'random') as BalancerStrategyType,
            selector: b.selector || [],
            fallbackTag: b.fallbackTag || '',
            settings: b.strategy?.settings
        }));
    }, [templateSettings?.routing?.balancers]);

    const [search, setSearch] = useState('');
    const filteredRows = useMemo(() =>
    {
        const needle = search.trim().toLowerCase();
        if (!needle)
        {
            return rows;
        }
        return rows.filter((r) =>
            [r.tag, r.strategy, r.fallbackTag, ...(r.selector || [])]
                .some((v) => String(v || '').toLowerCase().includes(needle))
        );
    }, [rows, search]);

    const outboundTags = useMemo(() =>
    {
        const tags = new Set<string>();
        for (const o of templateSettings?.outbounds || [])
        {
            if (o?.tag)
            {
                tags.add(o.tag);
            }
        }
        for (const tag of clientReverseTags || [])
        {
            if (tag)
            {
                tags.add(tag);
            }
        }
        return [...tags];
    }, [templateSettings?.outbounds, clientReverseTags]);

    const otherTags = useMemo(() =>
    {
        if (editingIndex == null)
        {
            return rows.map((b) => b.tag).filter(Boolean);
        }
        return rows.filter((b) => b.key !== editingIndex).map((b) => b.tag).filter(Boolean);
    }, [rows, editingIndex]);

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

    function openAdd()
    {
        setEditingBalancer(null);
        setEditingIndex(null);
        setModalOpen(true);
    }
    function openEdit(idx: number)
    {
        setEditingBalancer(rows[idx]);
        setEditingIndex(idx);
        setModalOpen(true);
    }

    function onConfirm(form: BalancerFormValue)
    {
        mutate((tt) =>
        {
            if (!tt.routing)
            {
                tt.routing = { rules: [], balancers: [] };
            }
            if (!Array.isArray(tt.routing.balancers))
            {
                tt.routing.balancers = [];
            }
            const list = tt.routing.balancers as BalancerRecord[];
            const wire: BalancerRecord = {
                tag: form.tag,
                selector: [...form.selector],
                fallbackTag: form.fallbackTag || ''
            };
            if (form.strategy && form.strategy !== 'random')
            {
                wire.strategy = { type: form.strategy };
                if (form.strategy === 'leastLoad' && form.settings)
                {
                    wire.strategy.settings = form.settings;
                }
            }
            if (editingIndex == null)
            {
                list.push(wire);
            }
            else
            {
                const oldTag = list[editingIndex]?.tag;
                list[editingIndex] = wire;
                if (oldTag && oldTag !== wire.tag)
                {
                    const rules = tt.routing.rules || [];
                    for (const rule of rules)
                    {
                        if (rule?.balancerTag === oldTag)
                        {
                            rule.balancerTag = wire.tag;
                        }
                    }
                }
            }
            syncObservatories(tt);
        });
        setModalOpen(false);
    }

    async function confirmDelete(idx: number)
    {
        const ok = await confirm({
            title: `${ t('delete') } ${ t('pages.xray.Balancers') } #${ idx + 1 }?`,
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            mutate((tt) =>
            {
                if (tt.routing?.balancers)
                {
                    tt.routing.balancers.splice(idx, 1);
                    syncObservatories(tt);
                }
            });
        }
    }

    const columns: Column<BalancerRow>[] = [
        {
            key: 'action',
            header: '#',
            align: 'center',
            width: 110,
            cell: (record) => (
        <div className="flex items-center justify-center gap-1.5">
          <span className="min-w-[18px] text-end font-medium text-muted-foreground">{record.key + 1}</span>
          {!isMobile && (
            <Tooltip content={t('edit')}>
              <Button aria-label={t('edit')} variant="ghost" size="icon" onClick={() => openEdit(record.key)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
          )}
          <DropdownMenu
            align="end"
            label={t('more')}
            items={[
                ...(isMobile
                    ? [{
                        key: 'edit',
                        label: t('edit'),
                        icon: <Pencil className="h-4 w-4" aria-hidden />,
                        onSelect: () => openEdit(record.key)
                    }]
                    : []),
                {
                    key: 'del',
                    danger: true,
                    label: t('delete'),
                    onSelect: () => confirmDelete(record.key)
                }
            ]}
          />
        </div>
            )
        },
        { key: 'tag', header: 'Tag', align: 'center', width: 160, accessor: (r) => r.tag },
        {
            key: 'strategy',
            header: 'Strategy',
            align: 'center',
            width: 140,
            cell: (record) => (
        <Badge variant={record.strategy === 'random' ? 'primary' : 'success'}>
          {STRATEGY_LABELS[record.strategy] || record.strategy}
        </Badge>
            )
        },
        {
            key: 'selector',
            header: 'Selector',
            align: 'center',
            cell: (record) => (
        <div className="flex flex-wrap justify-center gap-1">
          {(record.selector || []).map((sel) => (
            <Badge key={sel} variant="neutral">{sel}</Badge>
          ))}
        </div>
            )
        },
        { key: 'fallbackTag', header: 'Fallback', align: 'center', width: 160, accessor: (r) => r.fallbackTag }
    ];

    const hasObservatory = !!templateSettings?.observatory;
    const hasBurstObservatory = !!templateSettings?.burstObservatory;
    const showObsEditor = hasObservatory || hasBurstObservatory;

    const [obsView, setObsView] = useState<'observatory' | 'burstObservatory'>('observatory');

    useEffect(() =>
    {
        if (obsView === 'observatory' && !hasObservatory && hasBurstObservatory)
        {
            setObsView('burstObservatory');
        }
        else if (obsView === 'burstObservatory' && !hasBurstObservatory && hasObservatory)
        {
            setObsView('observatory');
        }
    }, [obsView, hasObservatory, hasBurstObservatory]);

    const obsText = useMemo(() =>
    {
        const src = obsView === 'observatory' ? templateSettings?.observatory : templateSettings?.burstObservatory;
        return src ? JSON.stringify(src, null, 2) : '';
    }, [obsView, templateSettings?.observatory, templateSettings?.burstObservatory]);

    function onObsTextChange(next: string)
    {
        let parsed;
        try
        {
            parsed = JSON.parse(next);
        }
        catch
        {
            return;
        }
        mutate((tt) =>
        {
            if (obsView === 'observatory')
            {
                tt.observatory = parsed;
            }
            else
            {
                tt.burstObservatory = parsed;
            }
        });
    }

    const obsTabs = [
        ...(hasObservatory ? [{ key: 'observatory', label: 'Observatory' }] : []),
        ...(hasBurstObservatory ? [{ key: 'burstObservatory', label: 'Burst Observatory' }] : [])
    ];

    return (
    <>
      <div className="flex w-full flex-col gap-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('emptyBalancersDesc')}</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('pages.xray.Balancers')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" aria-hidden />
                {t('pages.xray.Balancers')}
              </Button>
              <SearchInput
                className="w-full max-w-[260px] sm:w-auto"
                aria-label={t('search')}
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Table
              columns={columns}
              data={filteredRows}
              rowKey={(r) => String(r.key)}
              pageSize={10}
            />

            {showObsEditor && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <Tabs
                  tabs={obsTabs}
                  value={obsView}
                  onChange={(k) => setObsView(k as 'observatory' | 'burstObservatory')}
                  variant="segmented"
                  className="w-fit max-w-full"
                />
                <JsonEditor
                  value={obsText}
                  onChange={onObsTextChange}
                  minHeight="220px"
                  maxHeight="480px"
                />
              </div>
            )}
          </>
        )}
      </div>

      <BalancerFormModal
        key={modalOpen ? `${ editingIndex ?? 'new' }-${ editingBalancer?.tag ?? '' }` : 'closed'}
        open={modalOpen}
        balancer={editingBalancer}
        outboundTags={outboundTags}
        otherTags={otherTags}
        onClose={() => setModalOpen(false)}
        onConfirm={onConfirm}
      />
    </>
    );
}
