import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleX, LoaderCircle, Zap } from 'lucide-react';

import { Button, Table, Tooltip } from '@/components/ui';
import type { Column } from '@/components/ui';
import { isUdpOutbound } from '@/hooks/useXraySetting';
import type { OutboundTestState, OutboundTrafficRow } from '@/hooks/useXraySetting';

import type { OutboundRow } from './outbounds-tab-types';
import { ProtocolTags, AddressPills, TrafficCell } from './useOutboundColumns';
import { hasBreakdown, isTesting, isUntestable, testResult } from './outbounds-tab-helpers';

interface SubscriptionOutboundsProps {
  subscriptionOutbounds: unknown[];
  outboundsTraffic: OutboundTrafficRow[];
  subscriptionTestStates: Record<string, OutboundTestState>;
  testMode: 'tcp' | 'http';
  isMobile: boolean;
  onTestSubscription: (outbound: Record<string, unknown>, mode: string) => void;
}

// Read-only view of outbounds imported from active subscriptions. They are not
// part of the editable template (so no edit/delete/move), but traffic is matched
// by tag and they can be latency-tested via the same backend endpoint.
export default function SubscriptionOutbounds({
    subscriptionOutbounds,
    outboundsTraffic,
    subscriptionTestStates,
    testMode,
    isMobile,
    onTestSubscription
}: SubscriptionOutboundsProps)
{
    const { t } = useTranslation();

    const rows = useMemo<OutboundRow[]>(
        () => (subscriptionOutbounds || []).map((o, i) => ({ ...(o as object), key: i }) as OutboundRow),
        [subscriptionOutbounds]
    );

    function LatencyCell({ record }: { record: OutboundRow })
    {
        const key = record.tag || '';
        const r = testResult(subscriptionTestStates, key);
        if (!r)
        {
            return isTesting(subscriptionTestStates, key) ? (
        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            ) : (
        <span className="text-muted-foreground opacity-60">—</span>
            );
        }
        const breakdown = (
      <div className="min-w-[180px] max-w-[320px] text-xs leading-relaxed">
        <div className={`mb-1 flex items-center gap-1.5 font-semibold ${ r.success ? 'text-success' : 'text-danger' }`}>
          {r.success ? <span>{r.delay} ms</span> : <span>{r.error || 'failed'}</span>}
          {r.mode && (
            <span className="ms-auto rounded bg-accent-subtle px-1.5 text-[10px] font-medium text-accent">
              {String(r.mode).toUpperCase()}
            </span>
          )}
        </div>
        {hasBreakdown(r) &&
          (r.endpoints || []).map((ep) => (
            <div key={ep.address} className="flex items-center gap-1.5 whitespace-nowrap text-[11px]">
              <span className={ep.success ? 'text-success' : 'text-danger'}>●</span>
              <span className="min-w-0 flex-1 truncate font-mono">{ep.address}</span>
              <span className="text-muted-foreground">{ep.success ? `${ ep.delay } ms` : ep.error || 'failed'}</span>
            </div>
          ))}
      </div>
        );
        return (
      <Tooltip content={breakdown} side="end">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              r.success ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
          }`}
        >
          {r.success ? <CircleCheck className="h-3.5 w-3.5" aria-hidden /> : <CircleX className="h-3.5 w-3.5" aria-hidden />}
          {r.success ? <span>{r.delay}&nbsp;ms</span> : <span>failed</span>}
        </span>
      </Tooltip>
        );
    }

    function TestButton({ record }: { record: OutboundRow })
    {
        const key = record.tag || '';
        const label = `${ t('check') } (${ (isUdpOutbound(record) ? 'http' : testMode).toUpperCase() })`;
        return (
      <Tooltip content={label}>
        <Button
          aria-label={label}
          size="icon"
          className="rounded-full"
          loading={isTesting(subscriptionTestStates, key)}
          disabled={!record.tag || isUntestable(record, testMode) || isTesting(subscriptionTestStates, key)}
          onClick={() => onTestSubscription(record as unknown as Record<string, unknown>, testMode)}
        >
          {!isTesting(subscriptionTestStates, key) && <Zap className="h-4 w-4" aria-hidden />}
        </Button>
      </Tooltip>
        );
    }

    const header = (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-semibold text-foreground">{t('pages.xray.outboundSub.fromSubsTitle')}</div>
      <div className="text-xs text-muted-foreground">{t('pages.xray.outboundSub.fromSubsDesc')}</div>
    </div>
    );

    if (rows.length === 0)
    {
        return null;
    }

    if (isMobile)
    {
        return (
      <div className="mt-4 flex flex-col gap-3">
        {header}
        {rows.map((record, index) => (
          <div key={record.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="font-medium text-muted-foreground">{index + 1}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <Tooltip content={record.tag}>
                    <span className="max-w-[180px] truncate font-medium">{record.tag || '—'}</span>
                  </Tooltip>
                  <ProtocolTags record={record} />
                </div>
              </div>
              <TestButton record={record} />
            </div>
            <AddressPills record={record} />
            <div className="flex items-center justify-between gap-2">
              <TrafficCell outboundsTraffic={outboundsTraffic} record={record} />
              <LatencyCell record={record} />
            </div>
          </div>
        ))}
      </div>
        );
    }

    const columns: Column<OutboundRow>[] = [
        {
            key: 'num',
            header: '#',
            align: 'center',
            width: 60,
            cell: (_record, index) => <span className="font-medium text-muted-foreground">{index + 1}</span>
        },
        {
            key: 'identity',
            header: t('pages.xray.outbound.tag'),
            align: 'start',
            cell: (record) => (
        <div className="flex min-w-0 flex-col gap-1">
          <Tooltip content={record.tag}>
            <span className="max-w-[200px] truncate font-medium">{record.tag || '—'}</span>
          </Tooltip>
          <ProtocolTags record={record} />
        </div>
            )
        },
        {
            key: 'address',
            header: t('pages.inbounds.address'),
            align: 'start',
            cell: (record) => <AddressPills record={record} />
        },
        {
            key: 'traffic',
            header: t('pages.inbounds.traffic'),
            align: 'start',
            width: 200,
            cell: (record) => <TrafficCell outboundsTraffic={outboundsTraffic} record={record} />
        },
        {
            key: 'testResult',
            header: t('pages.nodes.latency'),
            align: 'start',
            width: 140,
            cell: (record) => <LatencyCell record={record} />
        },
        {
            key: 'test',
            header: t('check'),
            align: 'center',
            width: 80,
            cell: (record) => <TestButton record={record} />
        }
    ];

    return (
    <div className="mt-4 flex flex-col gap-3">
      {header}
      <Table columns={columns} data={rows} rowKey={(r) => String(r.key)} pageSize={0} />
    </div>
    );
}
