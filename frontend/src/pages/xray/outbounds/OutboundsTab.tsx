import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown,
    ArrowUp,
    Cloud,
    Eye,
    Pencil,
    Play,
    Plug,
    Plus,
    RefreshCw,
    Trash2,
    TriangleAlert,
    CircleCheck
} from 'lucide-react';

import {
    Badge,
    Button,
    Input,
    Label,
    Modal,
    Switch,
    Table,
    Tabs,
    Tooltip,
    confirm
} from '@/components/ui';
import { HttpUtil } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import type { Column } from '@/components/ui';
import OutboundFormModal from './OutboundFormModal';
import SubscriptionOutbounds from './SubscriptionOutbounds';
import type { XraySettingsValue, SetTemplate, OutboundTestState, OutboundTrafficRow } from '@/hooks/useXraySetting';

import type { OutboundRow } from './outbounds-tab-types';
import { useOutboundColumns } from './useOutboundColumns';
import OutboundCardList from './OutboundCardList';

interface OutboundSub {
  id: number;
  remark?: string;
  url?: string;
  enabled?: boolean;
  allowPrivate?: boolean;
  prepend?: boolean;
  priority?: number;
  tagPrefix?: string;
  updateInterval?: number;
  lastUpdated?: number;
  lastError?: string;
  outboundCount?: number;
}

interface SubForm {
  remark: string;
  url: string;
  tagPrefix: string;
  updateInterval: number;
  enabled: boolean;
  allowPrivate: boolean;
  prepend: boolean;
}

const EMPTY_SUB_FORM: SubForm = {
    remark: '',
    url: '',
    tagPrefix: '',
    updateInterval: 600,
    enabled: true,
    allowPrivate: false,
    prepend: false
};

interface OutboundsTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
  outboundsTraffic: OutboundTrafficRow[];
  outboundTestStates: Record<number, OutboundTestState>;
  subscriptionTestStates: Record<string, OutboundTestState>;
  testingAll: boolean;
  inboundTags: string[];
  subscriptionOutbounds?: unknown[];
  isMobile: boolean;
  onResetTraffic: (tag: string) => void;
  onTest: (index: number, mode: string) => void;
  onTestSubscription: (outbound: Record<string, unknown>, mode: string) => void;
  onTestAll: (mode: string) => void;
  onShowWarp: () => void;
  onShowNord: () => void;
  onRefreshXrayData?: () => void;
}

export default function OutboundsTab({
    templateSettings,
    setTemplateSettings,
    outboundsTraffic,
    outboundTestStates,
    subscriptionTestStates,
    testingAll,
    inboundTags: _inboundTags,
    subscriptionOutbounds,
    isMobile,
    onResetTraffic,
    onTest,
    onTestSubscription,
    onTestAll,
    onShowWarp,
    onShowNord,
    onRefreshXrayData
}: OutboundsTabProps)
{
    const { t } = useTranslation();
    const message = getMessage();
    const [testMode, setTestMode] = useState<'tcp' | 'http'>('tcp');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingOutbound, setEditingOutbound] = useState<Record<string, unknown> | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [existingTags, setExistingTags] = useState<string[]>([]);

    // Subscription manager (CRUD + reorder + refresh + preview)
    const [subModalOpen, setSubModalOpen] = useState(false);
    const [subs, setSubs] = useState<OutboundSub[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);
    const [newSub, setNewSub] = useState<SubForm>(EMPTY_SUB_FORM);
    const [editingSubId, setEditingSubId] = useState<number | null>(null);
    const [savingSub, setSavingSub] = useState(false);
    const [refreshingId, setRefreshingId] = useState<number | null>(null);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewData, setPreviewData] = useState<{ tag?: string; protocol?: string }[] | null>(null);

    // Convenience: expose hours/minutes for the interval input
    const intervalHours = Math.floor((newSub.updateInterval || 600) / 3600);
    const intervalMinutes = Math.floor(((newSub.updateInterval || 600) % 3600) / 60);
    function setIntervalHM(h: number, m: number)
    {
        const secs = Math.max(60, (h || 0) * 3600 + (m || 0) * 60);
        setNewSub((prev) => ({ ...prev, updateInterval: secs }));
    }

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

    // --- Subscription management ---
    const loadSubs = useCallback(async () =>
    {
        setSubsLoading(true);
        try
        {
            const r = await HttpUtil.get('/panel/xray/outbound-subs');
            if (r?.success)
            {
                setSubs(Array.isArray(r.obj) ? (r.obj as OutboundSub[]) : []);
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.toastLoadFailed'));
        }
        finally
        {
            setSubsLoading(false);
        }
    }, [message, t]);

    function openSubManager()
    {
        setSubModalOpen(true);
        loadSubs();
    }

    function subBody(src: Partial<SubForm>)
    {
        return {
            remark: src.remark ?? '',
            url: src.url ?? '',
            tagPrefix: src.tagPrefix ?? '',
            updateInterval: src.updateInterval ?? 600,
            enabled: src.enabled ?? true,
            allowPrivate: src.allowPrivate ?? false,
            prepend: src.prepend ?? false
        };
    }
    function resetSubForm()
    {
        setNewSub(EMPTY_SUB_FORM);
        setEditingSubId(null);
        setPreviewData(null);
    }
    function openEditSub(sub: OutboundSub)
    {
        setNewSub({
            remark: sub.remark ?? '',
            url: sub.url ?? '',
            tagPrefix: sub.tagPrefix ?? '',
            updateInterval: sub.updateInterval ?? 600,
            enabled: sub.enabled ?? true,
            allowPrivate: sub.allowPrivate ?? false,
            prepend: sub.prepend ?? false
        });
        setEditingSubId(sub.id);
        setPreviewData(null);
    }
    async function saveSub()
    {
        if (!newSub.url.trim())
        {
            message.warning(t('pages.xray.outboundSub.toastUrlRequired'));
            return;
        }
        setSavingSub(true);
        try
        {
            const url = editingSubId != null
                ? `/panel/xray/outbound-subs/${ editingSubId }`
                : '/panel/xray/outbound-subs';
            const r = await HttpUtil.post<OutboundSub>(url, subBody(newSub));
            if (r?.success)
            {
                message.success(t(editingSubId != null ? 'pages.xray.outboundSub.toastUpdated' : 'pages.xray.outboundSub.toastAdded'));
                const createdId = editingSubId == null ? r.obj?.id : undefined;
                resetSubForm();
                await loadSubs();
                if (createdId)
                {
                    await refreshOne(createdId);
                }
                onRefreshXrayData?.();
            }
            else
            {
                message.error(r?.msg || t('pages.xray.outboundSub.toastAddFailed'));
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.toastAddFailed'));
        }
        finally
        {
            setSavingSub(false);
        }
    }
    async function previewSub()
    {
        if (!newSub.url.trim())
        {
            message.warning(t('pages.xray.outboundSub.toastUrlRequired'));
            return;
        }
        setPreviewing(true);
        setPreviewData(null);
        try
        {
            const r = await HttpUtil.post<{ tag?: string; protocol?: string }[]>('/panel/xray/outbound-subs/parse', {
                url: newSub.url,
                allowPrivate: newSub.allowPrivate
            });
            if (r?.success && Array.isArray(r.obj))
            {
                setPreviewData(r.obj);
                if (r.obj.length === 0)
                {
                    message.info(t('pages.xray.outboundSub.previewEmpty'));
                }
            }
            else
            {
                message.error(r?.msg || t('pages.xray.outboundSub.previewEmpty'));
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.previewEmpty'));
        }
        finally
        {
            setPreviewing(false);
        }
    }
    async function toggleEnabled(sub: OutboundSub)
    {
        setBusyId(sub.id);
        try
        {
            const r = await HttpUtil.post(`/panel/xray/outbound-subs/${ sub.id }`, subBody({ ...sub, enabled: !sub.enabled }));
            if (r?.success)
            {
                await loadSubs();
                onRefreshXrayData?.();
            }
            else
            {
                message.error(r?.msg || t('pages.xray.outboundSub.toastAddFailed'));
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.toastAddFailed'));
        }
        finally
        {
            setBusyId(null);
        }
    }
    async function moveSub(id: number, dir: 'up' | 'down')
    {
        setBusyId(id);
        try
        {
            const r = await HttpUtil.post(`/panel/xray/outbound-subs/${ id }/move`, { dir });
            if (r?.success)
            {
                await loadSubs();
                onRefreshXrayData?.();
            }
        }
        catch
        {
            /* ignore */
        }
        finally
        {
            setBusyId(null);
        }
    }
    async function refreshOne(id: number)
    {
        setRefreshingId(id);
        try
        {
            const r = await HttpUtil.post(`/panel/xray/outbound-subs/${ id }/refresh`);
            if (r?.success)
            {
                message.success(t('pages.xray.outboundSub.toastRefreshed'));
                await loadSubs();
                onRefreshXrayData?.();
            }
            else
            {
                message.error(r?.msg || t('pages.xray.outboundSub.toastRefreshFailed'));
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.toastRefreshFailed'));
        }
        finally
        {
            setRefreshingId(null);
        }
    }
    async function refreshAllSubs()
    {
        if (subs.length === 0)
        {
            return;
        }
        setRefreshingAll(true);
        try
        {
            for (const s of subs)
            {
                try
                {
                    await HttpUtil.post(`/panel/xray/outbound-subs/${ s.id }/refresh`);
                }
                catch
                {
                    /* continue */
                }
            }
            message.success(t('pages.xray.outboundSub.toastRefreshed'));
            await loadSubs();
            onRefreshXrayData?.();
        }
        finally
        {
            setRefreshingAll(false);
        }
    }
    async function deleteOne(id: number)
    {
        const ok = await confirm({
            title: t('pages.xray.outboundSub.deleteConfirm'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        try
        {
            const r = await HttpUtil.post(`/panel/xray/outbound-subs/${ id }/del`);
            if (r?.success)
            {
                message.success(t('pages.xray.outboundSub.toastDeleted'));
                await loadSubs();
                onRefreshXrayData?.();
            }
        }
        catch
        {
            message.error(t('pages.xray.outboundSub.toastDeleteFailed'));
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

    const subColumns: Column<OutboundSub>[] = useMemo(
        () => [
            {
                key: 'order',
                header: '',
                width: 72,
                cell: (r, index) => (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move up"
              disabled={index === 0 || busyId === r.id}
              onClick={() => moveSub(r.id, 'up')}
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move down"
              disabled={index === subs.length - 1 || busyId === r.id}
              onClick={() => moveSub(r.id, 'down')}
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
          </div>
                )
            },
            {
                key: 'remark',
                header: t('pages.xray.outboundSub.colRemark'),
                align: 'start',
                cell: (r) => (
          <div className="flex flex-col">
            <span>{r.remark || <em className="text-muted-foreground">{t('pages.xray.outboundSub.auto')}</em>}</span>
            {r.tagPrefix && <span className="text-[11px] text-muted-foreground">{r.tagPrefix}</span>}
          </div>
                )
            },
            {
                key: 'outboundCount',
                header: t('pages.xray.Outbounds'),
                align: 'center',
                cell: (r) => r.outboundCount ?? 0
            },
            {
                key: 'status',
                header: t('status'),
                align: 'center',
                cell: (r) => (r.lastError
                    ? (
            <Tooltip content={r.lastError}>
              <TriangleAlert className="h-4 w-4 text-danger" aria-hidden />
            </Tooltip>
                    )
                    : (
            <Tooltip content={t('pages.xray.outboundSub.statusOk')}>
              <CircleCheck className="h-4 w-4 text-success" aria-hidden />
            </Tooltip>
                    ))
            },
            {
                key: 'lastUpdated',
                header: t('pages.xray.outboundSub.colLastFetch'),
                align: 'start',
                cell: (r) => (r.lastUpdated ? new Date(r.lastUpdated * 1000).toLocaleString() : t('pages.xray.outboundSub.never'))
            },
            {
                key: 'enabled',
                header: t('pages.xray.outboundSub.colEnabled'),
                align: 'center',
                cell: (r) => (
          <Switch
            checked={!!r.enabled}
            disabled={busyId === r.id}
            onCheckedChange={() => toggleEnabled(r)}
            aria-label={t('pages.xray.outboundSub.colEnabled')}
          />
                )
            },
            {
                key: 'actions',
                header: '',
                align: 'end',
                cell: (r) => (
          <div className="flex items-center justify-end gap-1">
            <Tooltip content={t('edit')}>
              <Button variant="ghost" size="icon" aria-label={t('edit')} onClick={() => openEditSub(r)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip content={t('pages.xray.outboundSub.refreshNow')}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('pages.xray.outboundSub.refreshNow')}
                loading={refreshingId === r.id}
                onClick={() => refreshOne(r.id)}
              >
                {refreshingId !== r.id && <RefreshCw className="h-4 w-4" aria-hidden />}
              </Button>
            </Tooltip>
            <Tooltip content={t('delete')}>
              <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => deleteOne(r.id)}>
                <Trash2 className="h-4 w-4 text-danger" aria-hidden />
              </Button>
            </Tooltip>
          </div>
                )
            }
        ],
        [t, busyId, subs.length, refreshingId]
    );

    return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden />
              {!isMobile && t('pages.xray.Outbounds')}
            </Button>
            <Button variant="secondary" onClick={openSubManager}>
              <Cloud className="h-4 w-4" aria-hidden />
              {t('pages.xray.outboundSub.manage')}
            </Button>
            <Button variant="secondary" onClick={onShowWarp}>
              <Cloud className="h-4 w-4" aria-hidden />
              WARP
            </Button>
            <Button variant="secondary" onClick={onShowNord}>
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
          <Table columns={columns} data={rows} rowKey={(r) => String(r.key)} pageSize={10} />
        )}

        {/* Subscription outbounds (read-only, merged at runtime) */}
        {Array.isArray(subscriptionOutbounds) && subscriptionOutbounds.length > 0 && (
          <SubscriptionOutbounds
            subscriptionOutbounds={subscriptionOutbounds}
            outboundsTraffic={outboundsTraffic}
            subscriptionTestStates={subscriptionTestStates}
            testMode={testMode}
            isMobile={isMobile}
            onTestSubscription={onTestSubscription}
          />
        )}

        <OutboundFormModal
          open={modalOpen}
          outbound={editingOutbound}
          existingTags={existingTags}
          onClose={() => setModalOpen(false)}
          onConfirm={onConfirm}
        />
      </div>

      <Modal
        open={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        title={t('pages.xray.outboundSub.title')}
        size="lg"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            {editingSubId != null && (
              <div className="flex items-center gap-2">
                <Badge variant="primary">{t('edit')}</Badge>
                <span className="font-semibold">{newSub.remark || newSub.url}</span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-remark">{t('pages.xray.outboundSub.remark')}</Label>
              <Input
                id="sub-remark"
                value={newSub.remark}
                onChange={(e) => setNewSub({ ...newSub, remark: e.target.value })}
                placeholder={t('pages.xray.outboundSub.remarkPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-url">{t('pages.xray.outboundSub.url')}</Label>
              <Input
                id="sub-url"
                value={newSub.url}
                onChange={(e) => setNewSub({ ...newSub, url: e.target.value })}
                placeholder={t('pages.xray.outboundSub.urlPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-prefix">{t('pages.xray.outboundSub.tagPrefix')}</Label>
              <Input
                id="sub-prefix"
                value={newSub.tagPrefix}
                onChange={(e) => setNewSub({ ...newSub, tagPrefix: e.target.value })}
                placeholder={t('pages.xray.outboundSub.tagPrefixPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('pages.xray.outboundSub.interval')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  className="w-20"
                  value={intervalHours}
                  onChange={(e) => setIntervalHM(Number(e.target.value) || 0, intervalMinutes)}
                  aria-label={t('pages.xray.outboundSub.hours')}
                />
                <span className="text-sm text-muted-foreground">{t('pages.xray.outboundSub.hours')}</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  className="w-20"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalHM(intervalHours, Number(e.target.value) || 0)}
                  aria-label={t('pages.xray.outboundSub.minutes')}
                />
                <span className="text-sm text-muted-foreground">{t('pages.xray.outboundSub.minutes')}</span>
              </div>
              <span className="text-xs text-muted-foreground">{t('pages.xray.outboundSub.intervalHint')}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>{t('pages.xray.outboundSub.enabled')}</Label>
              <Switch
                checked={newSub.enabled}
                onCheckedChange={(v) => setNewSub({ ...newSub, enabled: v })}
                aria-label={t('pages.xray.outboundSub.enabled')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label>{t('pages.xray.outboundSub.allowPrivate')}</Label>
                <Switch
                  checked={newSub.allowPrivate}
                  onCheckedChange={(v) => setNewSub({ ...newSub, allowPrivate: v })}
                  aria-label={t('pages.xray.outboundSub.allowPrivate')}
                />
              </div>
              <span className="text-xs text-muted-foreground">{t('pages.xray.outboundSub.allowPrivateHint')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label>{t('pages.xray.outboundSub.prepend')}</Label>
                <Switch
                  checked={newSub.prepend}
                  onCheckedChange={(v) => setNewSub({ ...newSub, prepend: v })}
                  aria-label={t('pages.xray.outboundSub.prepend')}
                />
              </div>
              <span className="text-xs text-muted-foreground">{t('pages.xray.outboundSub.prependHint')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={saveSub} loading={savingSub}>
                {editingSubId != null
                    ? <Pencil className="h-4 w-4" aria-hidden />
                    : <Plus className="h-4 w-4" aria-hidden />}
                {editingSubId != null ? t('save') : t('pages.xray.outboundSub.addButton')}
              </Button>
              <Button variant="secondary" onClick={previewSub} loading={previewing}>
                <Eye className="h-4 w-4" aria-hidden />
                {t('pages.xray.outboundSub.preview')}
              </Button>
              {editingSubId != null && (
                <Button variant="ghost" onClick={resetSubForm}>{t('cancel')}</Button>
              )}
            </div>
            {previewData && previewData.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{previewData.length} · {t('pages.xray.Outbounds')}</span>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                  {previewData.map((o, i) => (
                    <Badge key={i} variant="neutral">
                      {o?.tag || '—'}{o?.protocol ? ` · ${ o.protocol }` : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{t('pages.xray.outboundSub.active')}</span>
              <Button variant="ghost" size="icon" aria-label={t('check')} loading={subsLoading} onClick={loadSubs}>
                {!subsLoading && <RefreshCw className="h-4 w-4" aria-hidden />}
              </Button>
              {subs.length > 0 && (
                <Button size="sm" loading={refreshingAll} onClick={refreshAllSubs}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  {t('pages.xray.outboundSub.refreshAll')}
                </Button>
              )}
            </div>
            {subs.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('pages.xray.outboundSub.empty')}</div>
            ) : (
              <Table columns={subColumns} data={subs} rowKey={(r) => String(r.id)} pageSize={0} />
            )}
            <span className="text-xs text-muted-foreground">{t('pages.xray.outboundSub.restartHint')}</span>
          </div>
        </div>
      </Modal>
    </>
    );
}
