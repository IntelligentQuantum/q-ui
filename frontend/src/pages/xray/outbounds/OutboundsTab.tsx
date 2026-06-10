import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Plug, Play, RefreshCw, Plus } from 'lucide-react';

import { Button, Table, Tabs, Tooltip, confirm } from '@/components/ui';
import OutboundFormModal from './OutboundFormModal';
import type { XraySettingsValue, SetTemplate, OutboundTestState, OutboundTrafficRow } from '@/hooks/useXraySetting';

import type { OutboundRow } from './outbounds-tab-types';
import { useOutboundColumns } from './useOutboundColumns';
import OutboundCardList from './OutboundCardList';

interface OutboundsTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
  outboundsTraffic: OutboundTrafficRow[];
  outboundTestStates: Record<number, OutboundTestState>;
  testingAll: boolean;
  inboundTags: string[];
  isMobile: boolean;
  onResetTraffic: (tag: string) => void;
  onTest: (index: number, mode: string) => void;
  onTestAll: (mode: string) => void;
  onShowWarp: () => void;
  onShowNord: () => void;
}

export default function OutboundsTab({
    templateSettings,
    setTemplateSettings,
    outboundsTraffic,
    outboundTestStates,
    testingAll,
    inboundTags: _inboundTags,
    isMobile,
    onResetTraffic,
    onTest,
    onTestAll,
    onShowWarp,
    onShowNord
}: OutboundsTabProps)
{
    const { t } = useTranslation();
    const [testMode, setTestMode] = useState<'tcp' | 'http'>('tcp');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingOutbound, setEditingOutbound] = useState<Record<string, unknown> | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [existingTags, setExistingTags] = useState<string[]>([]);

    const outbounds = useMemo(
        () => (templateSettings?.outbounds || []) as unknown as OutboundRow[],
        [templateSettings?.outbounds]
    );

    const rows = useMemo(() => outbounds.map((o, i) => ({ ...o, key: i })), [outbounds]);

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
        setEditingOutbound(null);
        setEditingIndex(null);
        setExistingTags((templateSettings?.outbounds || []).map((o) => o?.tag).filter((tg): tg is string => !!tg));
        setModalOpen(true);
    }
    function openEdit(idx: number)
    {
        setEditingOutbound((templateSettings?.outbounds || [])[idx] as Record<string, unknown>);
        setEditingIndex(idx);
        setExistingTags(
            (templateSettings?.outbounds || [])
                .filter((_, i) => i !== idx)
                .map((o) => o?.tag)
                .filter((tg): tg is string => !!tg)
        );
        setModalOpen(true);
    }
    function onConfirm(outbound: Record<string, unknown>)
    {
        mutate((tt) =>
        {
            if (!Array.isArray(tt.outbounds))
            {
                tt.outbounds = [];
            }
            if (editingIndex == null)
            {
                if (!outbound.tag)
                {
                    return;
                }
                tt.outbounds.push(outbound as never);
            }
            else
            {
                tt.outbounds[editingIndex] = outbound as never;
            }
        });
        setModalOpen(false);
    }

    async function confirmDelete(idx: number)
    {
        const ok = await confirm({
            title: `${ t('delete') } ${ t('pages.xray.Outbounds') } #${ idx + 1 }?`,
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            mutate((tt) =>
            {
                tt.outbounds?.splice(idx, 1);
            });
        }
    }
    function setFirst(idx: number)
    {
        mutate((tt) =>
        {
            if (!tt.outbounds)
            {
                return;
            }
            const [moved] = tt.outbounds.splice(idx, 1);
            tt.outbounds.unshift(moved);
        });
    }
    function moveUp(idx: number)
    {
        if (idx <= 0)
        {
            return;
        }
        mutate((tt) =>
        {
            if (!tt.outbounds)
            {
                return;
            }
            [tt.outbounds[idx - 1], tt.outbounds[idx]] = [tt.outbounds[idx], tt.outbounds[idx - 1]];
        });
    }
    function moveDown(idx: number)
    {
        mutate((tt) =>
        {
            if (!tt.outbounds || idx >= tt.outbounds.length - 1)
            {
                return;
            }
            [tt.outbounds[idx + 1], tt.outbounds[idx]] = [tt.outbounds[idx], tt.outbounds[idx + 1]];
        });
    }

    async function confirmResetAll()
    {
        const ok = await confirm({
            title: t('pages.inbounds.resetAllTrafficContent'),
            confirmText: t('reset'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            onResetTraffic('-alltags-');
        }
    }

    const columns = useOutboundColumns({
        testMode,
        rows,
        outboundsTraffic,
        outboundTestStates,
        openEdit,
        setFirst,
        moveUp,
        moveDown,
        confirmDelete,
        onResetTraffic,
        onTest
    });

    return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden />
              {!isMobile && t('pages.xray.Outbounds')}
            </Button>
            <Button onClick={onShowWarp}>
              <Cloud className="h-4 w-4" aria-hidden />
              WARP
            </Button>
            <Button onClick={onShowNord}>
              <Plug className="h-4 w-4" aria-hidden />
              NordVPN
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content={t('pages.xray.outbound.testModeTooltip')}>
              <div>
                <Tabs
                  tabs={[
                      { key: 'tcp', label: 'TCP' },
                      { key: 'http', label: 'HTTP' }
                  ]}
                  value={testMode}
                  onChange={(k) => setTestMode(k as 'tcp' | 'http')}
                  variant="segmented"
                  aria-label={t('pages.xray.outbound.testModeTooltip')}
                />
              </div>
            </Tooltip>
            <Button loading={testingAll} onClick={() => onTestAll(testMode)}>
              <Play className="h-4 w-4" aria-hidden />
              {!isMobile && t('pages.xray.outbound.testAll')}
            </Button>
            <Tooltip content={t('pages.inbounds.resetAllTrafficContent')}>
              <Button
                aria-label={t('pages.inbounds.resetAllTrafficContent')}
                variant="secondary"
                size="icon"
                onClick={confirmResetAll}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
          </div>
        </div>

        {isMobile ? (
          <OutboundCardList
            rows={rows}
            testMode={testMode}
            outboundsTraffic={outboundsTraffic}
            outboundTestStates={outboundTestStates}
            setFirst={setFirst}
            openEdit={openEdit}
            onResetTraffic={onResetTraffic}
            confirmDelete={confirmDelete}
            onTest={onTest}
          />
        ) : (
          <Table columns={columns} data={rows} rowKey={(r) => String(r.key)} pageSize={15} />
        )}

        <OutboundFormModal
          open={modalOpen}
          outbound={editingOutbound}
          existingTags={existingTags}
          onClose={() => setModalOpen(false)}
          onConfirm={onConfirm}
        />
      </div>
    </>
    );
}
