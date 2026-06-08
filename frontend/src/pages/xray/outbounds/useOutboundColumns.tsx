import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowUp,
    ArrowDown,
    CircleCheck,
    CircleX,
    LoaderCircle,
    Pencil,
    RefreshCw,
    Zap
} from 'lucide-react';

import { Badge, Button, DropdownMenu, Tooltip } from '@/components/ui';
import type { Column } from '@/components/ui';
import { SizeFormatter } from '@/utils';
import { OutboundProtocols as Protocols } from '@/schemas/primitives';
import { isUdpOutbound } from '@/hooks/useXraySetting';
import type { OutboundTestState, OutboundTrafficRow } from '@/hooks/useXraySetting';

import type { OutboundRow } from './outbounds-tab-types';
import {
    hasBreakdown,
    isTesting,
    isUntestable,
    outboundAddresses,
    showSecurity,
    testResult,
    trafficFor
} from './outbounds-tab-helpers';

interface OutboundColumnsParams {
  testMode: 'tcp' | 'http';
  rows: OutboundRow[];
  outboundsTraffic: OutboundTrafficRow[];
  outboundTestStates: Record<number, OutboundTestState>;
  openEdit: (idx: number) => void;
  setFirst: (idx: number) => void;
  moveUp: (idx: number) => void;
  moveDown: (idx: number) => void;
  confirmDelete: (idx: number) => void;
  onResetTraffic: (tag: string) => void;
  onTest: (index: number, mode: string) => void;
}

export function ProtocolTags({ record }: { record: OutboundRow })
{
    return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="success">{record.protocol}</Badge>
      {[Protocols.VMess, Protocols.VLESS, Protocols.Trojan, Protocols.Shadowsocks].includes(record.protocol as never) && (
        <>
          {record.streamSettings?.network && <Badge variant="neutral">{record.streamSettings.network}</Badge>}
          {showSecurity(record.streamSettings?.security) && (
            <Badge variant="primary">{record.streamSettings?.security}</Badge>
          )}
        </>
      )}
    </div>
    );
}

export function AddressPills({ record }: { record: OutboundRow })
{
    const addrs = outboundAddresses(record);
    if (addrs.length === 0)
    {
        return <span className="text-muted-foreground opacity-60">—</span>;
    }
    return (
    <div className="flex flex-wrap gap-1">
      {addrs.map((addr) => (
        <Tooltip key={addr} content={addr}>
          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-foreground">{addr}</span>
        </Tooltip>
      ))}
    </div>
    );
}

export function TrafficCell({
    outboundsTraffic,
    record
}: {
  outboundsTraffic: OutboundTrafficRow[];
  record: OutboundRow;
})
{
    const tr = trafficFor(outboundsTraffic, record);
    return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-success">↑ {SizeFormatter.sizeFormat(tr.up)}</span>
      <span className="text-accent">↓ {SizeFormatter.sizeFormat(tr.down)}</span>
    </div>
    );
}

export function TestResultCell({
    outboundTestStates,
    index
}: {
  outboundTestStates: Record<number, OutboundTestState>;
  index: number;
})
{
    const r = testResult(outboundTestStates, index);
    if (!r)
    {
        return isTesting(outboundTestStates, index) ? (
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

export function TestButton({
    record,
    index,
    testMode,
    outboundTestStates,
    onTest
}: {
  record: OutboundRow;
  index: number;
  testMode: 'tcp' | 'http';
  outboundTestStates: Record<number, OutboundTestState>;
  onTest: (index: number, mode: string) => void;
})
{
    const { t } = useTranslation();
    const label = `${ t('check') } (${ (isUdpOutbound(record) ? 'http' : testMode).toUpperCase() })`;
    return (
    <Tooltip content={label}>
      <Button
        aria-label={label}
        size="icon"
        className="rounded-full"
        loading={isTesting(outboundTestStates, index)}
        disabled={isUntestable(record, testMode) || isTesting(outboundTestStates, index)}
        onClick={() => onTest(index, testMode)}
      >
        {!isTesting(outboundTestStates, index) && <Zap className="h-4 w-4" aria-hidden />}
      </Button>
    </Tooltip>
    );
}

export function useOutboundColumns({
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
}: OutboundColumnsParams): Column<OutboundRow>[]
{
    const { t } = useTranslation();
    return useMemo(
        () => [
            {
                key: 'action',
                header: '#',
                align: 'center',
                width: 110,
                cell: (_record, index) => (
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-medium text-muted-foreground">{index + 1}</span>
            <Tooltip content={t('edit')}>
              <Button aria-label={t('edit')} variant="ghost" size="icon" onClick={() => openEdit(index)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
            <DropdownMenu
              align="end"
              label={t('more')}
              items={[
                  ...(index > 0
                      ? [{
                          key: 'top',
                          label: 'Move to top',
                          icon: <ArrowUp className="h-4 w-4" aria-hidden />,
                          onSelect: () => setFirst(index)
                      }]
                      : []),
                  {
                      key: 'up',
                      label: 'Move up',
                      icon: <ArrowUp className="h-4 w-4" aria-hidden />,
                      disabled: index === 0,
                      onSelect: () => moveUp(index)
                  },
                  {
                      key: 'down',
                      label: 'Move down',
                      icon: <ArrowDown className="h-4 w-4" aria-hidden />,
                      disabled: index === rows.length - 1,
                      onSelect: () => moveDown(index)
                  },
                  {
                      key: 'reset',
                      label: 'Reset traffic',
                      icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                      onSelect: () => onResetTraffic(rows[index].tag || '')
                  },
                  {
                      key: 'del',
                      danger: true,
                      label: 'Delete',
                      onSelect: () => confirmDelete(index)
                  }
              ]}
            />
          </div>
                )
            },
            {
                key: 'identity',
                header: t('pages.xray.outbound.tag'),
                align: 'start',
                cell: (record) => (
          <div className="flex min-w-0 flex-col gap-1">
            <Tooltip content={record.tag}>
              <span className="max-w-[200px] truncate font-medium">{record.tag}</span>
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
                cell: (_record, index) => (
          <TestResultCell outboundTestStates={outboundTestStates} index={index} />
                )
            },
            {
                key: 'test',
                header: t('check'),
                align: 'center',
                width: 80,
                cell: (record, index) => (
          <TestButton
            record={record}
            index={index}
            testMode={testMode}
            outboundTestStates={outboundTestStates}
            onTest={onTest}
          />
                )
            }
        ],
        [t, testMode, rows, outboundTestStates, outboundsTraffic]
    );
}
