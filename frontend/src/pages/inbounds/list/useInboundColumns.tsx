import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';

import { SizeFormatter, IntlUtil, ColorUtils } from '@/utils';
import { InfinityIcon, Badge, Switch, Tooltip, type Column, type BadgeVariant } from '@/components/ui';
import { useDatepicker } from '@/hooks/useDatepicker';
import type { NodeRecord } from '@/api/queries/useNodesQuery';

import { RowActionsCell } from './RowActions';
import {
    readStreamHints,
    networkLabel,
    networkL4,
    shadowsocksNetworkLabel,
    tunnelNetworkLabel,
    mixedNetworkLabel
} from './helpers';
import type { ClientCountEntry, DBInboundRecord, RowAction } from './types';

interface UseInboundColumnsParams {
  hasAnyRemark: boolean;
  hasActiveNode: boolean;
  nodesById: Map<number, NodeRecord>;
  clientCount: Record<number, ClientCountEntry>;
  subEnable: boolean;
  expireDiff: number;
  trafficDiff: number;
  onRowAction: (action: { key: RowAction; dbInbound: DBInboundRecord }) => void;
  onSwitchEnable: (dbInbound: DBInboundRecord, next: boolean) => void;
}

// Map the legacy AntD usageColor tokens onto Badge variants.
function usageVariant(color: string): BadgeVariant
{
    switch (color)
    {
        case 'green':
        case 'success':
            return 'success';
        case 'red':
        case 'error':
            return 'danger';
        case 'orange':
        case 'warning':
        case 'gold':
            return 'warning';
        case 'blue':
        case 'purple':
            return 'primary';
        default:
            return 'neutral';
    }
}

export function useInboundColumns({
    hasAnyRemark,
    hasActiveNode,
    nodesById,
    clientCount,
    subEnable,
    expireDiff,
    trafficDiff,
    onRowAction,
    onSwitchEnable
}: UseInboundColumnsParams): Column<DBInboundRecord>[]
{
    const { t } = useTranslation();
    const { datepicker } = useDatepicker();

    return useMemo(() =>
    {
        const cols: Column<DBInboundRecord>[] = [
            {
                key: 'id',
                header: 'ID',
                align: 'end',
                width: 48,
                hideBelow: 'sm',
                cell: (record) => <span className="tabular-nums text-muted-foreground">{record.id}</span>
            },
            {
                key: 'action',
                header: t('pages.inbounds.operate'),
                align: 'center',
                width: 96,
                cell: (record) => (
          <RowActionsCell
            record={record}
            subEnable={subEnable}
            hasClients={(clientCount[record.id]?.clients || 0) > 0}
            onClick={(key) => onRowAction({ key, dbInbound: record })}
          />
                )
            },
            {
                key: 'enable',
                header: t('pages.inbounds.enable'),
                align: 'center',
                width: 64,
                cell: (record) => (
          <div className="flex justify-center">
            <Switch
              checked={record.enable}
              onCheckedChange={(next) => onSwitchEnable(record, next)}
              aria-label={t('pages.inbounds.enable')}
            />
          </div>
                )
            }
        ];

        if (hasAnyRemark)
        {
            cols.push({
                key: 'remark',
                header: t('pages.inbounds.remark'),
                align: 'center',
                cell: (record) => <span className="font-medium">{record.remark}</span>
            });
        }

        if (hasActiveNode)
        {
            cols.push({
                key: 'node',
                header: t('pages.inbounds.node'),
                align: 'center',
                hideBelow: 'lg',
                cell: (record) =>
                {
                    if (record.nodeId == null)
                    {
                        return <Badge variant="neutral">{t('pages.inbounds.localPanel')}</Badge>;
                    }
                    const node = nodesById.get(record.nodeId);
                    if (!node)
                    {
                        return <Badge variant="warning">node #{record.nodeId}</Badge>;
                    }
                    return (
            <Badge variant={node.status === 'online' ? 'primary' : 'danger'}>{node.name}</Badge>
                    );
                }
            });
        }

        cols.push(
            {
                key: 'port',
                header: t('pages.inbounds.port'),
                align: 'center',
                width: 80,
                cell: (record) => <span className="tabular-nums">{record.port}</span>
            },
            {
                key: 'protocol',
                header: t('pages.inbounds.protocol'),
                align: 'start',
                hideBelow: 'md',
                cell: (record) =>
                {
                    const tags: ReactElement[] = [<Badge key="p" variant="primary">{record.protocol}</Badge>];
                    if (record.isWireguard || record.isHysteria)
                    {
                        tags.push(<Badge key="n" variant="success">UDP</Badge>);
                    }
                    else if (record.isSS)
                    {
                        const stream = readStreamHints(record.streamSettings);
                        tags.push(<Badge key="n" variant="success">{shadowsocksNetworkLabel(record.settings)}</Badge>);
                        if (stream.isTls)
                        {
                            tags.push(<Badge key="tls" variant="primary">TLS</Badge>);
                        }
                    }
                    else if (record.isTunnel)
                    {
                        tags.push(<Badge key="n" variant="success">{tunnelNetworkLabel(record.settings)}</Badge>);
                    }
                    else if (record.isMixed)
                    {
                        tags.push(<Badge key="n" variant="success">{mixedNetworkLabel(record.settings)}</Badge>);
                    }
                    else if (record.isVMess || record.isVLess || record.isTrojan)
                    {
                        const stream = readStreamHints(record.streamSettings);
                        tags.push(<Badge key="n" variant="success">{networkLabel(stream.network)}</Badge>);
                        const l4 = networkL4(stream.network);
                        if (l4)
                        {
                            tags.push(<Badge key="l4" variant="success">{l4}</Badge>);
                        }
                        if (stream.isTls)
                        {
                            tags.push(<Badge key="tls" variant="primary">TLS</Badge>);
                        }
                        if (stream.isReality)
                        {
                            tags.push(<Badge key="reality" variant="primary">Reality</Badge>);
                        }
                    }
                    return <div className="flex flex-wrap gap-1">{tags}</div>;
                }
            },
            {
                key: 'clients',
                header: t('clients'),
                align: 'start',
                hideBelow: 'lg',
                cell: (record) =>
                {
                    const cc = clientCount[record.id];
                    if (!cc)
                    {
                        return null;
                    }
                    const emailList = (emails: string[]) => (
            <div className="max-h-[200px] min-w-[150px] overflow-y-auto">
              {emails.map((e) => (
                <div key={e} className="py-0.5 font-mono text-xs">{e}</div>
              ))}
            </div>
                    );
                    return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="neutral" className="tabular-nums">
                <Users className="h-3 w-3" aria-hidden /> {cc.clients}
              </Badge>
              {cc.active.length > 0 && (
                <Tooltip interactive side="bottom" content={emailList(cc.active)}>
                  <Badge variant="success" className="tabular-nums">{cc.active.length}</Badge>
                </Tooltip>
              )}
              {cc.deactive.length > 0 && (
                <Tooltip interactive side="bottom" content={emailList(cc.deactive)}>
                  <Badge variant="neutral" className="tabular-nums">{cc.deactive.length}</Badge>
                </Tooltip>
              )}
              {cc.depleted.length > 0 && (
                <Tooltip interactive side="bottom" content={emailList(cc.depleted)}>
                  <Badge variant="danger" className="tabular-nums">{cc.depleted.length}</Badge>
                </Tooltip>
              )}
              {cc.online.length > 0 && (
                <Tooltip interactive side="bottom" content={emailList(cc.online)}>
                  <Badge variant="primary" className="tabular-nums">{cc.online.length}</Badge>
                </Tooltip>
              )}
            </div>
                    );
                }
            },
            {
                key: 'traffic',
                header: t('pages.inbounds.traffic'),
                align: 'center',
                cell: (record) => (
          <Tooltip
            content={(
              <div className="text-xs">
                <div className="flex gap-3">
                  <span>↑ {SizeFormatter.sizeFormat(record.up)}</span>
                  <span>↓ {SizeFormatter.sizeFormat(record.down)}</span>
                </div>
                {record.total > 0 && record.up + record.down < record.total && (
                  <div className="mt-1 flex gap-3">
                    <span>{t('remained')}</span>
                    <span>{SizeFormatter.sizeFormat(record.total - record.up - record.down)}</span>
                  </div>
                )}
              </div>
            )}
          >
            <Badge variant={usageVariant(ColorUtils.usageColor(record.up + record.down, trafficDiff, record.total))}>
              {SizeFormatter.sizeFormat(record.up + record.down)} /
              {' '}
              {record.total > 0 ? SizeFormatter.sizeFormat(record.total) : <InfinityIcon />}
            </Badge>
          </Tooltip>
                )
            },
            {
                key: 'expiryTime',
                header: t('pages.inbounds.expireDate'),
                align: 'center',
                hideBelow: 'md',
                cell: (record) =>
                {
                    if (record.expiryTime > 0)
                    {
                        return (
              <Tooltip content={IntlUtil.formatDate(record.expiryTime, datepicker)}>
                <Badge variant={usageVariant(ColorUtils.usageColor(Date.now(), expireDiff, record._expiryTime))}>
                  {IntlUtil.formatRelativeTime(record.expiryTime)}
                </Badge>
              </Tooltip>
                        );
                    }
                    return <Badge variant="primary"><InfinityIcon /></Badge>;
                }
            }
        );

        return cols;
    }, [t, hasAnyRemark, hasActiveNode, nodesById, clientCount, subEnable, expireDiff, trafficDiff, datepicker, onRowAction, onSwitchEnable]);
}
