import { useTranslation } from 'react-i18next';

import { SizeFormatter, IntlUtil, ColorUtils } from '@/utils';
import { InfinityIcon, Modal, Badge, type BadgeVariant } from '@/components/ui';
import type { NodeRecord } from '@/api/queries/useNodesQuery';

import {
    readStreamHints,
    networkLabel,
    networkL4,
    shadowsocksNetworkLabel,
    tunnelNetworkLabel,
    mixedNetworkLabel
} from './helpers';
import type { ClientCountEntry, DBInboundRecord } from './types';

interface InboundStatsModalProps {
  open: boolean;
  record: DBInboundRecord | null;
  hasActiveNode: boolean;
  nodesById: Map<number, NodeRecord>;
  clientCount: Record<number, ClientCountEntry>;
  trafficDiff: number;
  expireDiff: number;
  onClose: () => void;
}

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

function StatRow({ label, children }: { label: string; children: React.ReactNode })
{
    return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-[96px] shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
    );
}

export default function InboundStatsModal({
    open,
    record,
    hasActiveNode,
    nodesById,
    clientCount,
    trafficDiff,
    expireDiff,
    onClose
}: InboundStatsModalProps)
{
    const { t } = useTranslation();
    return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={record ? `#${ record.id } ${ record.remark || '' }`.trim() : ''}
    >
      {record && (
        <div className="flex flex-col gap-2.5">
          <StatRow label={t('pages.inbounds.protocol')}>
            <Badge variant="primary">{record.protocol}</Badge>
            {(record.isWireguard || record.isHysteria) && <Badge variant="success">UDP</Badge>}
            {record.isSS && (() =>
            {
                const stream = readStreamHints(record.streamSettings);
                return (
                <>
                  <Badge variant="success">{shadowsocksNetworkLabel(record.settings)}</Badge>
                  {stream.isTls && <Badge variant="primary">TLS</Badge>}
                </>
                );
            })()}
            {record.isTunnel && <Badge variant="success">{tunnelNetworkLabel(record.settings)}</Badge>}
            {record.isMixed && <Badge variant="success">{mixedNetworkLabel(record.settings)}</Badge>}
            {(record.isVMess || record.isVLess || record.isTrojan) && (() =>
            {
                const stream = readStreamHints(record.streamSettings);
                const l4 = networkL4(stream.network);
                return (
                <>
                  <Badge variant="success">{networkLabel(stream.network)}</Badge>
                  {l4 && <Badge variant="success">{l4}</Badge>}
                  {stream.isTls && <Badge variant="primary">TLS</Badge>}
                  {stream.isReality && <Badge variant="primary">Reality</Badge>}
                </>
                );
            })()}
          </StatRow>

          <StatRow label={t('pages.inbounds.port')}>
            <Badge variant="neutral" className="tabular-nums">{record.port}</Badge>
          </StatRow>

          {hasActiveNode && (
            <StatRow label={t('pages.inbounds.node')}>
              {record.nodeId == null ? (
                <Badge variant="neutral">{t('pages.inbounds.localPanel')}</Badge>
              ) : nodesById.get(record.nodeId) ? (
                <Badge variant={nodesById.get(record.nodeId)!.status === 'online' ? 'primary' : 'danger'}>
                  {nodesById.get(record.nodeId)!.name}
                </Badge>
              ) : (
                <Badge variant="warning">#{record.nodeId}</Badge>
              )}
            </StatRow>
          )}

          <StatRow label={t('pages.inbounds.traffic')}>
            <Badge variant={usageVariant(ColorUtils.usageColor(record.up + record.down, trafficDiff, record.total))}>
              {SizeFormatter.sizeFormat(record.up + record.down)} /
              {' '}
              {record.total > 0 ? SizeFormatter.sizeFormat(record.total) : <InfinityIcon />}
            </Badge>
          </StatRow>

          {clientCount[record.id] && (
            <StatRow label={t('clients')}>
              <Badge variant="success" className="tabular-nums">{clientCount[record.id].clients}</Badge>
              {clientCount[record.id].online.length > 0 && (
                <Badge variant="primary">{clientCount[record.id].online.length} {t('online')}</Badge>
              )}
              {clientCount[record.id].depleted.length > 0 && (
                <Badge variant="danger">{clientCount[record.id].depleted.length} {t('depleted')}</Badge>
              )}
              {clientCount[record.id].expiring.length > 0 && (
                <Badge variant="warning">{clientCount[record.id].expiring.length} {t('depletingSoon')}</Badge>
              )}
            </StatRow>
          )}

          <StatRow label={t('pages.inbounds.expireDate')}>
            {record.expiryTime > 0 ? (
              <Badge variant={usageVariant(ColorUtils.usageColor(Date.now(), expireDiff, record._expiryTime))}>
                {IntlUtil.formatRelativeTime(record.expiryTime)}
              </Badge>
            ) : (
              <Badge variant="primary"><InfinityIcon /></Badge>
            )}
          </StatRow>
        </div>
      )}
    </Modal>
    );
}
