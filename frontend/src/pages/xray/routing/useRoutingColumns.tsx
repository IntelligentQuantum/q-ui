import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    GripVertical,
    Pencil,
    ArrowUp,
    ArrowDown,
    ExternalLink,
    Network
} from 'lucide-react';

import { Badge, Button, DropdownMenu, Tooltip } from '@/components/ui';
import CriterionRow from './CriterionRow';
import type { RuleRow } from './types';

export interface RoutingColumn {
  key: string;
  title: ReactNode;
  align?: 'start' | 'center' | 'end';
  width?: number;
  hidden?: boolean;
  render: (record: RuleRow, index: number) => ReactNode;
}

interface RoutingColumnsParams {
  isMobile: boolean;
  rowsLength: number;
  showSource: boolean;
  showBalancer: boolean;
  onHandlePointerDown: (idx: number, ev: React.PointerEvent) => void;
  openEdit: (idx: number) => void;
  moveUp: (idx: number) => void;
  moveDown: (idx: number) => void;
  confirmDelete: (idx: number) => void;
}

const EMPTY = <span className="opacity-40">—</span>;

export function useRoutingColumns({
    isMobile,
    rowsLength,
    showSource,
    showBalancer,
    onHandlePointerDown,
    openEdit,
    moveUp,
    moveDown,
    confirmDelete
}: RoutingColumnsParams): RoutingColumn[]
{
    const { t } = useTranslation();
    return useMemo(
        () => [
            {
                key: 'action',
                title: '#',
                align: 'center',
                width: 120,
                render: (_record, index) => (
          <div className="flex items-center gap-1.5">
            <span
              role="button"
              tabIndex={0}
              title={t('pages.xray.routing.dragToReorder')}
              onPointerDown={(ev: React.PointerEvent) => onHandlePointerDown(index, ev)}
              className="grid h-7 w-7 cursor-grab touch-none place-items-center rounded text-muted-foreground opacity-50 transition-opacity hover:opacity-90 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-[18px] text-end font-medium text-muted-foreground">{index + 1}</span>
            <div className="ms-auto flex items-center justify-end gap-1">
              {!isMobile && (
                <Tooltip content={t('edit')}>
                  <Button aria-label={t('edit')} variant="ghost" size="icon" onClick={() => openEdit(index)}>
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
                            onSelect: () => openEdit(index)
                        }]
                        : []),
                    {
                        key: 'up',
                        label: <ArrowUp className="h-4 w-4" aria-hidden />,
                        disabled: index === 0,
                        onSelect: () => moveUp(index)
                    },
                    {
                        key: 'down',
                        label: <ArrowDown className="h-4 w-4" aria-hidden />,
                        disabled: index === rowsLength - 1,
                        onSelect: () => moveDown(index)
                    },
                    {
                        key: 'del',
                        danger: true,
                        label: t('delete'),
                        onSelect: () => confirmDelete(index)
                    }
                ]}
              />
            </div>
          </div>
                )
            },
            {
                key: 'source',
                title: t('pages.xray.rules.source'),
                align: 'start',
                width: 180,
                hidden: !showSource,
                render: (record) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {record.sourceIP && <CriterionRow label="IP" value={record.sourceIP} title={`Source IP: ${ record.sourceIP }`} />}
            {record.sourcePort && <CriterionRow label="Port" value={record.sourcePort} title={`Source port: ${ record.sourcePort }`} />}
            {record.vlessRoute && <CriterionRow label="VLESS" value={record.vlessRoute} title={`VLESS route: ${ record.vlessRoute }`} />}
            {!record.sourceIP && !record.sourcePort && !record.vlessRoute && EMPTY}
          </div>
                )
            },
            {
                key: 'network',
                title: t('pages.inbounds.network'),
                align: 'start',
                width: 180,
                render: (record) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {record.network && <CriterionRow label="L4" value={record.network} title={`L4: ${ record.network }`} />}
            {record.protocol && <CriterionRow label="Protocol" value={record.protocol} title={`Protocol: ${ record.protocol }`} />}
            {record.attrs && <CriterionRow label="Attrs" value={record.attrs} title={`Attrs: ${ record.attrs }`} />}
            {!record.network && !record.protocol && !record.attrs && EMPTY}
          </div>
                )
            },
            {
                key: 'destination',
                title: t('pages.xray.rules.dest'),
                align: 'start',
                width: 200,
                render: (record) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {record.ip && <CriterionRow label="IP" value={record.ip} title={`Destination IP: ${ record.ip }`} />}
            {record.domain && <CriterionRow label="Domain" value={record.domain} title={`Domain: ${ record.domain }`} />}
            {record.port && <CriterionRow label="Port" value={record.port} title={`Destination port: ${ record.port }`} />}
            {!record.ip && !record.domain && !record.port && EMPTY}
          </div>
                )
            },
            {
                key: 'inbound',
                title: t('pages.xray.Inbounds'),
                align: 'start',
                width: 180,
                render: (record) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {record.inboundTag && <CriterionRow label="Tag" value={record.inboundTag} title={`Inbound tag: ${ record.inboundTag }`} />}
            {record.user && <CriterionRow label="User" value={record.user} title={`User: ${ record.user }`} />}
            {!record.inboundTag && !record.user && EMPTY}
          </div>
                )
            },
            {
                key: 'outbound',
                title: t('pages.xray.Outbounds'),
                align: 'start',
                width: 170,
                render: (record) =>
                    record.outboundTag ? (
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Badge variant="success">{record.outboundTag}</Badge>
            </div>
                    ) : (
                        EMPTY
                    )
            },
            {
                key: 'balancer',
                title: t('pages.xray.Balancers'),
                align: 'start',
                width: 150,
                hidden: !showBalancer,
                render: (record) =>
                    record.balancerTag ? (
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Badge variant="primary">{record.balancerTag}</Badge>
            </div>
                    ) : (
                        EMPTY
                    )
            }
        ],
        [t, isMobile, rowsLength, showSource, showBalancer]
    );
}
