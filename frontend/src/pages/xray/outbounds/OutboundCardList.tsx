import { useTranslation } from 'react-i18next';
import { ArrowUp, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { DropdownMenu, Tooltip } from '@/components/ui';
import { SizeFormatter } from '@/utils';
import type { OutboundTestState, OutboundTrafficRow } from '@/hooks/useXraySetting';

import type { OutboundRow } from './outbounds-tab-types';
import { outboundAddresses, trafficFor } from './outbounds-tab-helpers';
import { ProtocolTags, TestButton, TestResultCell } from './useOutboundColumns';

interface OutboundCardListProps {
  rows: OutboundRow[];
  testMode: 'tcp' | 'http';
  outboundsTraffic: OutboundTrafficRow[];
  outboundTestStates: Record<number, OutboundTestState>;
  setFirst: (idx: number) => void;
  openEdit: (idx: number) => void;
  onResetTraffic: (tag: string) => void;
  confirmDelete: (idx: number) => void;
  onTest: (index: number, mode: string) => void;
}

export default function OutboundCardList({
    rows,
    testMode,
    outboundsTraffic,
    outboundTestStates,
    setFirst,
    openEdit,
    onResetTraffic,
    confirmDelete,
    onTest
}: OutboundCardListProps)
{
    const { t } = useTranslation();
    if (rows.length === 0)
    {
        return <div className="py-4 text-center text-muted-foreground opacity-60">—</div>;
    }
    return (
    <div className="flex flex-col gap-2">
      {rows.map((record, index) =>
      {
          const tr = trafficFor(outboundsTraffic, record);
          return (
          <div
            key={record.key}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="font-medium text-muted-foreground">{index + 1}</span>
                <Tooltip content={record.tag}>
                  <span className="max-w-[180px] truncate font-medium">{record.tag}</span>
                </Tooltip>
                <ProtocolTags record={record} />
              </div>
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
                        key: 'edit',
                        label: t('edit'),
                        icon: <Pencil className="h-4 w-4" aria-hidden />,
                        onSelect: () => openEdit(index)
                    },
                    {
                        key: 'reset',
                        label: t('pages.inbounds.resetTraffic'),
                        icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                        onSelect: () => onResetTraffic(record.tag || '')
                    },
                    {
                        key: 'del',
                        danger: true,
                        label: t('delete'),
                        icon: <Trash2 className="h-4 w-4" aria-hidden />,
                        onSelect: () => confirmDelete(index)
                    }
                ]}
              />
            </div>

            {outboundAddresses(record).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {outboundAddresses(record).map((addr) => (
                  <Tooltip key={addr} content={addr}>
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-foreground">{addr}</span>
                  </Tooltip>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-success">↑ {SizeFormatter.sizeFormat(tr.up)}</span>
              <span className="text-xs text-accent">↓ {SizeFormatter.sizeFormat(tr.down)}</span>
              <span className="ms-auto inline-flex items-center gap-2">
                <TestResultCell outboundTestStates={outboundTestStates} index={index} />
                <TestButton
                  record={record}
                  index={index}
                  testMode={testMode}
                  outboundTestStates={outboundTestStates}
                  onTest={onTest}
                />
              </span>
            </div>
          </div>
          );
      })}
    </div>
    );
}
