import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Boxes,
    CloudCog,
    Database,
    Eye,
    PauseCircle,
    Trash2
} from 'lucide-react';

import { HttpUtil, Msg, SizeFormatter } from '@/utils';
import { Sparkline } from '@/components/viz';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Alert, Badge, Modal, Select, Tabs, cn } from '@/components/ui';

const OBS_KEY = 'xrObs';

interface XrayMetricsModalProps {
  open: boolean;
  onClose: () => void;
}

interface MetricDef {
  key: string;
  tab: string;
  tabKey: string;
  title: string;
  icon: ReactNode;
  unit: 'B' | 'ns' | 'ms' | '';
  stroke: string;
}

interface XrayState {
  enabled: boolean;
  listen: string;
  reason: string;
}

interface ObservatoryTag {
  tag: string;
  alive: boolean;
  delay: number;
  lastSeenTime: number;
  lastTryTime: number;
}

const METRICS: MetricDef[] = [
    { key: 'xrAlloc', tab: 'Heap', tabKey: 'pages.index.xrayTabHeap', title: 'pages.index.xrayTitleHeap', icon: <Database className="h-4 w-4" aria-hidden />, unit: 'B', stroke: '#7c4dff' },
    { key: 'xrSys', tab: 'Sys', tabKey: 'pages.index.xrayTabSys', title: 'pages.index.xrayTitleSys', icon: <CloudCog className="h-4 w-4" aria-hidden />, unit: 'B', stroke: '#1890ff' },
    { key: 'xrHeapObjects', tab: 'Objects', tabKey: 'pages.index.xrayTabObjects', title: 'pages.index.xrayTitleObjects', icon: <Boxes className="h-4 w-4" aria-hidden />, unit: '', stroke: '#13c2c2' },
    { key: 'xrNumGC', tab: 'GC Count', tabKey: 'pages.index.xrayTabGcCount', title: 'pages.index.xrayTitleGcCount', icon: <Trash2 className="h-4 w-4" aria-hidden />, unit: '', stroke: '#fa8c16' },
    { key: 'xrPauseNs', tab: 'GC Pause', tabKey: 'pages.index.xrayTabGcPause', title: 'pages.index.xrayTitleGcPause', icon: <PauseCircle className="h-4 w-4" aria-hidden />, unit: 'ns', stroke: '#f5222d' },
    { key: OBS_KEY, tab: 'Observatory', tabKey: 'pages.index.xrayTabObservatory', title: 'pages.index.xrayTitleObservatory', icon: <Eye className="h-4 w-4" aria-hidden />, unit: 'ms', stroke: '#52c41a' }
];

function unitFormatter(unit: string): (v: number) => string
{
    if (unit === 'B')
    {
        return (v) => SizeFormatter.sizeFormat(Math.max(0, Number(v) || 0));
    }
    if (unit === 'ns')
    {
        return (v) =>
        {
            const n = Math.max(0, Number(v) || 0);
            if (n >= 1e6)
            {
                return `${ (n / 1e6).toFixed(2) } ms`;
            }
            if (n >= 1e3)
            {
                return `${ (n / 1e3).toFixed(1) } µs`;
            }
            return `${ n.toFixed(0) } ns`;
        };
    }
    if (unit === 'ms')
    {
        return (v) => `${ Math.round(Number(v) || 0) } ms`;
    }
    return (v) =>
    {
        const n = Number(v) || 0;
        return Math.round(n).toLocaleString();
    };
}

function fmtTimestamp(unixSec: number): string
{
    if (!unixSec)
    {
        return '—';
    }
    const d = new Date(unixSec * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${ d.toLocaleDateString() } ${ hh }:${ mm }:${ ss }`;
}

function formatFullTimestamp(unixSec: number): string
{
    const d = new Date(unixSec * 1000);
    const today = new Date();
    const sameDay = d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const time = `${ hh }:${ mm }:${ ss }`;
    if (sameDay)
    {
        return time;
    }
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${ MM }-${ DD } ${ time }`;
}

export default function XrayMetricsModal({ open, onClose }: XrayMetricsModalProps)
{
    const { t } = useTranslation();
    const { isMobile } = useMediaQuery();
    const [activeKey, setActiveKey] = useState('xrAlloc');
    const [bucket, setBucket] = useState('2');
    const [points, setPoints] = useState<number[]>([]);
    const [labels, setLabels] = useState<string[]>([]);
    const [timestamps, setTimestamps] = useState<number[]>([]);
    const [state, setState] = useState<XrayState>({ enabled: false, listen: '', reason: '' });
    const [obsTags, setObsTags] = useState<ObservatoryTag[]>([]);
    const [obsActiveTag, setObsActiveTag] = useState('');
    const obsTimerRef = useRef<number | null>(null);
    const openRef = useRef(open);

    const bucketNum = Number(bucket);
    const activeMetric = useMemo(() => METRICS.find((m) => m.key === activeKey), [activeKey]);
    const isObservatory = activeKey === OBS_KEY;
    const strokeColor = activeMetric?.stroke || '#008771';
    const yFormatter = useMemo(() => unitFormatter(activeMetric?.unit ?? ''), [activeMetric]);

    const activeObsTag = obsTags.find((tg) => tg.tag === obsActiveTag) || null;

    const tsLookup = useMemo(() =>
    {
        const m = new Map<string, number>();
        for (let i = 0; i < labels.length; i++)
        {
            m.set(labels[i], timestamps[i]);
        }
        return m;
    }, [labels, timestamps]);

    const tooltipLabelFormatter = useCallback(
        (label: string) =>
        {
            const ts = tsLookup.get(label);
            return ts ? formatFullTimestamp(ts) : label;
        },
        [tsLookup]
    );

    const applyHistory = useCallback((msg: Msg<{ t: number; v: number }[]> | null | undefined, currentBucket: number) =>
    {
        if (msg?.success && Array.isArray(msg.obj))
        {
            const vals: number[] = [];
            const labs: string[] = [];
            const tss: number[] = [];
            for (const p of msg.obj)
            {
                const d = new Date(p.t * 1000);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                labs.push(currentBucket >= 60 ? `${ hh }:${ mm }` : `${ hh }:${ mm }:${ ss }`);
                vals.push(Number(p.v) || 0);
                tss.push(Number(p.t) || 0);
            }
            setLabels(labs);
            setPoints(vals);
            setTimestamps(tss);
        }
        else
        {
            setLabels([]);
            setPoints([]);
            setTimestamps([]);
        }
    }, []);

    const fetchState = useCallback(async () =>
    {
        try
        {
            const msg = await HttpUtil.get<XrayState>('/panel/api/server/xrayMetricsState');
            if (msg?.success && msg.obj)
            {
                setState(msg.obj);
            }
        }
        catch (e)
        {
            console.error('Failed to fetch xray metrics state', e);
        }
    }, []);

    const fetchObservatory = useCallback(async () =>
    {
        try
        {
            const msg = await HttpUtil.get<ObservatoryTag[]>('/panel/api/server/xrayObservatory');
            if (msg?.success && Array.isArray(msg.obj))
            {
                const tags = msg.obj;
                setObsTags(tags);
                setObsActiveTag((prev) =>
                {
                    if (tags.find((tg) => tg.tag === prev))
                    {
                        return prev;
                    }
                    return tags[0]?.tag || '';
                });
            }
            else
            {
                setObsTags([]);
            }
        }
        catch (e)
        {
            console.error('Failed to fetch observatory snapshot', e);
            setObsTags([]);
        }
    }, []);

    const fetchMetricBucket = useCallback(async () =>
    {
        if (!activeMetric)
        {
            return;
        }
        try
        {
            const url = `/panel/api/server/xrayMetricsHistory/${ activeMetric.key }/${ bucketNum }`;
            const msg = await HttpUtil.get<{ t: number; v: number }[]>(url);
            applyHistory(msg, bucketNum);
        }
        catch (e)
        {
            console.error('Failed to fetch xray metrics bucket', e);
            setLabels([]);
            setPoints([]);
            setTimestamps([]);
        }
    }, [activeMetric, bucketNum, applyHistory]);

    const fetchObsBucket = useCallback(async () =>
    {
        if (!obsActiveTag)
        {
            setLabels([]);
            setPoints([]);
            setTimestamps([]);
            return;
        }
        try
        {
            const url = `/panel/api/server/xrayObservatoryHistory/${ encodeURIComponent(obsActiveTag) }/${ bucketNum }`;
            const msg = await HttpUtil.get<{ t: number; v: number }[]>(url);
            applyHistory(msg, bucketNum);
        }
        catch (e)
        {
            console.error('Failed to fetch observatory bucket', e);
            setLabels([]);
            setPoints([]);
            setTimestamps([]);
        }
    }, [obsActiveTag, bucketNum, applyHistory]);

    const stopObsPolling = useCallback(() =>
    {
        if (obsTimerRef.current != null)
        {
            window.clearInterval(obsTimerRef.current);
            obsTimerRef.current = null;
        }
    }, []);

    useEffect(() =>
    {
        openRef.current = open;
        if (open)
        {
            setActiveKey('xrAlloc');
            fetchState();
        }
        else
        {
            stopObsPolling();
        }
    }, [open, fetchState, stopObsPolling]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        if (isObservatory)
        {
            fetchObservatory();
            fetchObsBucket();
            stopObsPolling();
            obsTimerRef.current = window.setInterval(async () =>
            {
                if (!openRef.current || !isObservatory)
                {
                    return;
                }
                await fetchObservatory();
                fetchObsBucket();
            }, 2000);
        }
        else
        {
            stopObsPolling();
            fetchMetricBucket();
        }
        return () =>
        {
            stopObsPolling();
        };
    }, [open, activeKey, isObservatory, fetchObservatory, fetchObsBucket, fetchMetricBucket, stopObsPolling]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        if (isObservatory)
        {
            fetchObsBucket();
        }
        else
        {
            fetchMetricBucket();
        }
    }, [open, bucket, isObservatory, fetchObsBucket, fetchMetricBucket]);

    useEffect(() =>
    {
        if (open && isObservatory)
        {
            fetchObsBucket();
        }
    }, [open, obsActiveTag, isObservatory, fetchObsBucket]);

    const title = (
    <div className="flex flex-wrap items-center gap-2.5">
      <span>{t('pages.index.xrayMetricsTitle')}</span>
      <Select
        value={bucket}
        onChange={setBucket}
        className="w-20"
        options={[
            { value: '2', label: '2m' },
            { value: '30', label: '30m' },
            { value: '60', label: '1h' },
            { value: '120', label: '2h' },
            { value: '180', label: '3h' },
            { value: '300', label: '5h' }
        ]}
      />
    </div>
    );

    return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {!state.enabled && (
        <Alert
          variant="warning"
          className="mb-2.5"
          title={t('pages.index.xrayMetricsDisabled')}
        >
          {state.reason || t('pages.index.xrayMetricsHint')}
        </Alert>
      )}

      <Tabs
        value={activeKey}
        onChange={setActiveKey}
        className="mb-1"
        tabs={METRICS.map((m) =>
        {
            const tabLabel = m.tabKey ? t(m.tabKey) : m.tab;
            return {
                key: m.key,
                label: isMobile ? <span className="sr-only">{tabLabel}</span> : tabLabel,
                icon: isMobile ? m.icon : undefined
            };
        })}
      />

      {isObservatory && (
        <div className="px-1 pt-1">
          {state.enabled && obsTags.length === 0 ? (
            <Alert
              variant="info"
              className="mb-2.5"
              title={t('pages.index.xrayObservatoryEmpty')}
            >
              {t('pages.index.xrayObservatoryHint')}
            </Alert>
          ) : (
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <Select
                value={obsActiveTag || null}
                onChange={setObsActiveTag}
                className="min-w-[240px]"
                placeholder={t('pages.index.xrayObservatoryTagPlaceholder')}
                options={obsTags.map((tg) => ({
                    value: tg.tag,
                    label: (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                            'inline-block h-2 w-2 rounded-full',
                            tg.alive ? 'bg-success' : 'bg-danger'
                        )}
                        aria-hidden
                      />
                      {tg.tag}
                    </span>
                    )
                }))}
              />

              {activeObsTag && (
                <div className="flex flex-wrap items-center gap-2 text-xs opacity-85">
                  <Badge variant={activeObsTag.alive ? 'success' : 'danger'}>
                    {activeObsTag.alive
                        ? t('pages.index.xrayObservatoryAlive')
                        : t('pages.index.xrayObservatoryDead')}
                  </Badge>
                  <Badge variant="primary">{activeObsTag.delay} ms</Badge>
                  <span className="font-mono text-[11.5px] opacity-70">
                    {t('pages.index.xrayObservatoryLastSeen')}: {fmtTimestamp(activeObsTag.lastSeenTime)}
                  </span>
                  <span className="font-mono text-[11.5px] opacity-70">
                    {t('pages.index.xrayObservatoryLastTry')}: {fmtTimestamp(activeObsTag.lastTryTime)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mx-2 mb-4 mt-2 rounded-lg border border-border bg-surface-sunken/40 p-4">
        {activeMetric?.title && (
          <div className="mb-3 text-sm font-semibold text-foreground">{t(activeMetric.title)}</div>
        )}
        <Sparkline
          data={points}
          labels={labels}
          height={260}
          stroke={strokeColor}
          strokeWidth={2.2}
          showGrid
          showAxes
          tickCountX={5}
          maxPoints={points.length || 1}
          fillOpacity={0.18}
          markerRadius={3.2}
          showTooltip
          valueMin={0}
          valueMax={null}
          yFormatter={yFormatter}
          tooltipLabelFormatter={tooltipLabelFormatter}
          extrema={{ show: true, formatter: yFormatter }}
        />
      </div>
    </Modal>
    );
}
