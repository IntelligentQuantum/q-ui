import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CloudDownload,
    Eye,
    EyeOff,
    Network,
    Pencil,
    CircleAlert,
    Info,
    ChevronRight,
    Zap,
    Trash2
} from 'lucide-react';

import {
    Badge,
    Button,
    Card,
    Checkbox,
    DropdownMenu,
    Modal,
    Switch,
    Tooltip,
    cn
} from '@/components/ui';
import NodeHistoryPanel from './NodeHistoryPanel';
import type { NodeRecord } from '@/api/queries/useNodesQuery';
import { isPanelUpdateAvailable } from '@/lib/panel-version';

interface NodeListProps {
  nodes: NodeRecord[];
  loading?: boolean;
  isMobile?: boolean;
  latestVersion?: string;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onEdit: (node: NodeRecord) => void;
  onDelete: (node: NodeRecord) => void;
  onProbe: (node: NodeRecord) => void;
  onToggleEnable: (node: NodeRecord, next: boolean) => void;
  onUpdateNode: (node: NodeRecord) => void;
  onUpdateSelected: () => void;
}

function isUpdateEligible(n: NodeRecord): boolean
{
    return !!n.enable && n.status === 'online';
}

interface NodeRow extends NodeRecord {
  url: string;
  key: string | number;
}

function StatusDot({ status }: { status?: string })
{
    const color =
    status === 'online' ? 'bg-success' : status === 'offline' ? 'bg-danger' : 'bg-muted-foreground';
    return (
    <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color)} aria-hidden />
    );
}

function StatusLabel({ status }: { status?: string })
{
    const { t } = useTranslation();
    return (
    <span className={status === 'online' ? 'text-success' : undefined}>
      {t(`pages.nodes.statusValues.${ status || 'unknown' }`)}
    </span>
    );
}

function formatPct(p?: number): string
{
    if (typeof p !== 'number' || Number.isNaN(p))
    {
        return '-';
    }
    return `${ p.toFixed(1) }%`;
}

function formatUptime(secs?: number): string
{
    if (!secs)
    {
        return '-';
    }
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    if (days > 0)
    {
        return `${ days }d ${ hours }h`;
    }
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0)
    {
        return `${ hours }h ${ mins }m`;
    }
    return `${ mins }m`;
}

function useRelativeTime()
{
    const { t } = useTranslation();
    return (unixSeconds?: number) =>
    {
        if (!unixSeconds)
        {
            return t('pages.nodes.never');
        }
        const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
        if (diffSec < 5)
        {
            return t('pages.nodes.justNow');
        }
        if (diffSec < 60)
        {
            return `${ diffSec }s`;
        }
        if (diffSec < 3600)
        {
            return `${ Math.floor(diffSec / 60) }m`;
        }
        if (diffSec < 86400)
        {
            return `${ Math.floor(diffSec / 3600) }h`;
        }
        return `${ Math.floor(diffSec / 86400) }d`;
    };
}

const TH = 'whitespace-nowrap px-3 py-2.5 font-medium text-muted-foreground';
const TD = 'whitespace-nowrap px-3 py-3 text-foreground';

function ClientTags({ record }: { record: NodeRecord })
{
    const { t } = useTranslation();
    return (
    <div className="flex items-center justify-center gap-1.5">
      <Badge variant="success">{record.clientCount || 0}</Badge>
      {record.onlineCount ? (
        <Badge variant="primary">{record.onlineCount} {t('online')}</Badge>
      ) : null}
      {record.depletedCount ? (
        <Badge variant="danger">{record.depletedCount} {t('depleted')}</Badge>
      ) : null}
    </div>
    );
}

export default function NodeList({
    nodes,
    loading = false,
    isMobile = false,
    latestVersion = '',
    selectedIds,
    onSelectionChange,
    onEdit,
    onDelete,
    onProbe,
    onToggleEnable,
    onUpdateNode,
    onUpdateSelected
}: NodeListProps)
{
    const { t } = useTranslation();
    const relativeTime = useRelativeTime();

    const [showAddress, setShowAddress] = useState(false);
    const [statsNode, setStatsNode] = useState<NodeRow | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

    // Map a node GUID to its display name so a transitive sub-node can show which
    // parent it is reached through (#4983).
    const nameByGuid = useMemo(() =>
    {
        const m = new Map<string, string>();
        for (const n of nodes)
        {
            if (n.guid)
            {
                m.set(n.guid, n.name || n.guid);
            }
        }
        return m;
    }, [nodes]);

    // Order direct nodes first, each immediately followed by its transitive
    // sub-nodes, so the table reads as a parent -> child tree without colliding
    // with the per-row history expander (transitive nodes carry id 0).
    const dataSource = useMemo<NodeRow[]>(() =>
    {
        const toRow = (n: NodeRecord): NodeRow => ({
            ...n,
            url: `${ n.scheme }://${ n.address }:${ n.port }${ n.basePath || '/' }`,
            key: n.transitive ? `t-${ n.guid || '' }` : n.id
        });
        const childrenByParent = new Map<string, NodeRecord[]>();
        for (const n of nodes)
        {
            if (n.transitive && n.parentGuid)
            {
                const arr = childrenByParent.get(n.parentGuid) || [];
                arr.push(n);
                childrenByParent.set(n.parentGuid, arr);
            }
        }
        const ordered: NodeRow[] = [];
        const added = new Set<string>();
        const push = (n: NodeRecord) =>
        {
            const row = toRow(n);
            ordered.push(row);
            added.add(String(row.key));
        };
        for (const n of nodes)
        {
            if (n.transitive)
            {
                continue;
            }
            push(n);
            if (n.guid)
            {
                for (const child of childrenByParent.get(n.guid) || [])
                {
                    push(child);
                }
            }
        }
        // Transitive nodes whose parent isn't in the list still get shown.
        for (const n of nodes)
        {
            if (n.transitive && !added.has(`t-${ n.guid || '' }`))
            {
                push(n);
            }
        }
        return ordered;
    }, [nodes]);

    function toggleExpanded(id: number)
    {
        setExpandedIds((prev) =>
        {
            const next = new Set(prev);
            if (next.has(id))
            {
                next.delete(id);
            }
            else
            {
                next.add(id);
            }
            return next;
        });
    }

    const selectableRows = useMemo(
        () => dataSource.filter((r) => !r.transitive && isUpdateEligible(r)),
        [dataSource]
    );
    const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.includes(r.id));
    const someSelected = selectableRows.some((r) => selectedIds.includes(r.id));
    const showSelection = dataSource.length > 1;

    function toggleAll()
    {
        if (allSelected)
        {
            onSelectionChange([]);
        }
        else
        {
            onSelectionChange(selectableRows.map((r) => r.id));
        }
    }

    function toggleOne(id: number, checked: boolean)
    {
        if (checked)
        {
            onSelectionChange([...selectedIds.filter((x) => x !== id), id]);
        }
        else
        {
            onSelectionChange(selectedIds.filter((x) => x !== id));
        }
    }

    function rowMenuItems(record: NodeRow)
    {
        return [
            {
                key: 'probe',
                label: t('pages.nodes.probe'),
                icon: <Zap className="h-4 w-4" aria-hidden />,
                onSelect: () => onProbe(record)
            },
            ...(isUpdateEligible(record)
                ? [{
                    key: 'update',
                    label: t('pages.nodes.updatePanel'),
                    icon: <CloudDownload className="h-4 w-4" aria-hidden />,
                    onSelect: () => onUpdateNode(record)
                }]
                : []),
            {
                key: 'edit',
                label: t('edit'),
                icon: <Pencil className="h-4 w-4" aria-hidden />,
                onSelect: () => onEdit(record)
            },
            {
                key: 'delete',
                danger: true,
                label: t('delete'),
                icon: <Trash2 className="h-4 w-4" aria-hidden />,
                onSelect: () => onDelete(record)
            }
        ];
    }

    const ipToggle = (
    <Tooltip content={t('pages.index.toggleIpVisibility')}>
      <button
        type="button"
        aria-label={t('pages.index.toggleIpVisibility')}
        onClick={() => setShowAddress((v) => !v)}
        className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        {showAddress ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
      </button>
    </Tooltip>
    );

    function AddressLink({ url }: { url: string })
    {
        return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
            'text-accent transition-[filter] duration-200 hover:underline',
            !showAddress && 'blur-[5px]'
        )}
      >
        {url}
      </a>
        );
    }

    const emptyState = (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
      <Network className="h-8 w-8 opacity-50" aria-hidden />
      <div>{t('noData')}</div>
    </div>
    );

    return (
    <Card className="p-4 sm:p-5">
      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onUpdateSelected}>
            <CloudDownload className="h-4 w-4" aria-hidden />
            {t('pages.nodes.updateSelected', { count: selectedIds.length })}
          </Button>
        </div>
      )}

      {isMobile ? (
        <>
          <div className="mt-1 flex flex-col gap-3">
            {dataSource.length === 0 ? (
                emptyState
            ) : (
                dataSource.map((record) => record.transitive ? (
                <div
                  key={String(record.key)}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3 opacity-85 ps-4"
                >
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                    <StatusDot status={record.status} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{record.name}</span>
                    <Badge variant="neutral" className="gap-1">
                      <Network className="h-3 w-3" aria-hidden />
                      {t('pages.nodes.subNode')}
                    </Badge>
                  </div>
                </div>
                ) : (
                <div key={record.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3">
                  <div className="flex select-none items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(record.id)}
                      aria-label={t('info')}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground"
                    >
                      <ChevronRight
                        className={cn('h-4 w-4 transition-transform', expandedIds.has(record.id) && 'rotate-90')}
                        aria-hidden
                      />
                    </button>
                    <StatusDot status={record.status} />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(record.id)}
                      className="min-w-0 flex-1 truncate text-start font-semibold"
                    >
                      {record.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Tooltip content={t('info')}>
                        <button
                          type="button"
                          aria-label={t('info')}
                          onClick={() => setStatsNode(record)}
                          className="grid h-8 w-8 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Info className="h-5 w-5" aria-hidden />
                        </button>
                      </Tooltip>
                      <Switch
                        checked={!!record.enable}
                        onCheckedChange={(v) => onToggleEnable(record, v)}
                        aria-label={t('pages.nodes.enable')}
                      />
                      <DropdownMenu align="end" label={t('pages.nodes.actions')} items={rowMenuItems(record)} />
                    </div>
                  </div>

                  {expandedIds.has(record.id) && (
                    <div className="mt-1 border-t border-border pt-2">
                      <NodeHistoryPanel node={record} />
                    </div>
                  )}
                </div>
                ))
            )}
          </div>

          <Modal
            open={!!statsNode}
            onClose={() => setStatsNode(null)}
            size="sm"
            title={statsNode?.name || ''}
          >
            {statsNode && (
              <div className="flex flex-col gap-2 text-sm">
                {statsNode.remark && (
                  <StatRow label={t('pages.nodes.name')}>
                    <span>{statsNode.remark}</span>
                  </StatRow>
                )}
                <StatRow label={t('pages.nodes.address')}>
                  <AddressLink url={statsNode.url} />
                  {ipToggle}
                </StatRow>
                <StatRow label={t('pages.nodes.status')}>
                  <StatusDot status={statsNode.status} />
                  <StatusLabel status={statsNode.status} />
                  {statsNode.lastError && (
                    <Tooltip content={statsNode.lastError}>
                      <CircleAlert className="h-4 w-4 text-warning" aria-hidden />
                    </Tooltip>
                  )}
                </StatRow>
                <StatRow label={t('pages.nodes.cpu')}>
                  <Badge>{formatPct(statsNode.cpuPct)}</Badge>
                </StatRow>
                <StatRow label={t('pages.nodes.mem')}>
                  <Badge>{formatPct(statsNode.memPct)}</Badge>
                </StatRow>
                <StatRow label={t('pages.nodes.xrayVersion')}>
                  <Badge>{statsNode.xrayVersion || '-'}</Badge>
                </StatRow>
                <StatRow label={t('pages.nodes.panelVersion') || 'Panel version'}>
                  <Badge>{statsNode.panelVersion || '-'}</Badge>
                </StatRow>
                <StatRow label={t('pages.nodes.uptime')}>
                  <Badge>{formatUptime(statsNode.uptimeSecs)}</Badge>
                </StatRow>
                <StatRow label={t('pages.nodes.latency')}>
                  <Badge>
                    {statsNode.latencyMs && statsNode.latencyMs > 0 ? `${ statsNode.latencyMs } ms` : '-'}
                  </Badge>
                </StatRow>
                <StatRow label={t('clients')}>
                  <ClientTags record={statsNode} />
                </StatRow>
                <StatRow label={t('pages.nodes.lastHeartbeat')}>
                  <Badge>{relativeTime(statsNode.lastHeartbeat)}</Badge>
                </StatRow>
              </div>
            )}
          </Modal>
        </>
      ) : (
        <div className={cn('overflow-x-auto rounded-lg border border-border', loading && 'opacity-60')}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-start">
                {showSelection && (
                  <th className={cn(TH, 'w-10 text-center')}>
                    <Checkbox
                      ref={(el) =>
                      {
                          if (el)
                          {
                              el.indeterminate = !allSelected && someSelected;
                          }
                      }}
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label={t('pages.nodes.updateSelected', { count: selectableRows.length })}
                    />
                  </th>
                )}
                <th className={cn(TH, 'text-center', 'w-[190px]')}>{t('pages.nodes.actions')}</th>
                <th className={cn(TH, 'text-center', 'w-20')}>{t('pages.nodes.enable')}</th>
                <th className={TH}>{t('pages.nodes.name')}</th>
                <th className={TH}>
                  <span className="inline-flex items-center gap-1.5">
                    {t('pages.nodes.address')}
                    {ipToggle}
                  </span>
                </th>
                <th className={cn(TH, 'text-center')}>{t('pages.nodes.status')}</th>
                <th className={cn(TH, 'text-center', 'w-[90px]')}>{t('pages.nodes.cpu')}</th>
                <th className={cn(TH, 'text-center', 'w-[90px]')}>{t('pages.nodes.mem')}</th>
                <th className={cn(TH, 'text-center')}>{t('pages.nodes.xrayVersion')}</th>
                <th className={cn(TH, 'text-center')}>{t('pages.nodes.panelVersion') || 'Panel version'}</th>
                <th className={cn(TH, 'text-center')}>{t('pages.nodes.uptime')}</th>
                <th className={cn(TH, 'text-center', 'w-40')}>{t('clients')}</th>
                <th className={cn(TH, 'text-center', 'w-[100px]')}>{t('pages.nodes.latency')}</th>
                <th className={cn(TH, 'text-center', 'w-[120px]')}>{t('pages.nodes.lastHeartbeat')}</th>
              </tr>
            </thead>
            <tbody>
              {dataSource.length === 0 ? (
                <tr>
                  <td colSpan={showSelection ? 15 : 14} className="px-3">{emptyState}</td>
                </tr>
              ) : (
                  dataSource.map((record) =>
                  {
                      const canUpdate = isUpdateEligible(record)
                    && isPanelUpdateAvailable(latestVersion, record.panelVersion || '');
                      const expandable = !record.transitive;
                      const expanded = expandable && expandedIds.has(record.id);
                      return (
                    <ExpandableRows key={String(record.key)}>
                      <tr className="border-b border-border transition-colors hover:bg-foreground/[0.03]">
                        {showSelection && (
                          <td className={cn(TD, 'text-center')}>
                            {!record.transitive && isUpdateEligible(record) ? (
                              <Checkbox
                                checked={selectedIds.includes(record.id)}
                                onChange={(e) => toggleOne(record.id, e.target.checked)}
                                aria-label={record.name}
                              />
                            ) : null}
                          </td>
                        )}
                        <td className={cn(TD, 'text-center')}>
                          {record.transitive ? (
                            <Tooltip content={t('pages.nodes.subNodeTip', { parent: record.parentGuid ? (nameByGuid.get(record.parentGuid) || '-') : '-' })}>
                              <Badge variant="neutral" className="gap-1">
                                <Network className="h-3 w-3" aria-hidden />
                                {t('pages.nodes.subNode')}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Tooltip content={t('pages.nodes.probe')}>
                                <Button aria-label={t('pages.nodes.probe')} variant="ghost" size="icon" onClick={() => onProbe(record)}>
                                  <Zap className="h-4 w-4" aria-hidden />
                                </Button>
                              </Tooltip>
                              {isUpdateEligible(record) && (
                                <Tooltip content={t('pages.nodes.updatePanel')}>
                                  <Button aria-label={t('pages.nodes.updatePanel')} variant="ghost" size="icon" onClick={() => onUpdateNode(record)}>
                                    <CloudDownload className="h-4 w-4" aria-hidden />
                                  </Button>
                                </Tooltip>
                              )}
                              <Tooltip content={t('edit')}>
                                <Button aria-label={t('edit')} variant="ghost" size="icon" onClick={() => onEdit(record)}>
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </Button>
                              </Tooltip>
                              <Tooltip content={t('delete')}>
                                <Button aria-label={t('delete')} variant="ghost" size="icon" onClick={() => onDelete(record)} className="text-danger hover:text-danger">
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              </Tooltip>
                            </div>
                          )}
                        </td>
                        <td className={cn(TD, 'text-center')}>
                          {record.transitive ? (
                            <span className="opacity-40">—</span>
                          ) : (
                            <div className="flex justify-center">
                              <Switch
                                checked={!!record.enable}
                                onCheckedChange={(v) => onToggleEnable(record, v)}
                                aria-label={t('pages.nodes.enable')}
                              />
                            </div>
                          )}
                        </td>
                        <td className={TD}>
                          <div className={cn('flex flex-col', record.transitive && 'ps-5')}>
                            <span className="flex items-center font-medium">
                              {record.transitive && <Network className="me-1.5 h-3.5 w-3.5 opacity-60" aria-hidden />}
                              {record.name}
                            </span>
                            {record.remark && <span className="text-xs text-muted-foreground">{record.remark}</span>}
                          </div>
                        </td>
                        <td className={cn(TD, 'max-w-[260px] truncate')}>
                          <AddressLink url={record.url} />
                        </td>
                        <td className={cn(TD, 'text-center')}>
                          <div className="flex items-center justify-center gap-1.5">
                            <StatusDot status={record.status} />
                            <StatusLabel status={record.status} />
                            {record.lastError && (
                              <Tooltip content={record.lastError}>
                                <CircleAlert className="h-4 w-4 text-warning" aria-hidden />
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className={cn(TD, 'text-center')}>{formatPct(record.cpuPct)}</td>
                        <td className={cn(TD, 'text-center')}>{formatPct(record.memPct)}</td>
                        <td className={cn(TD, 'text-center')}>{record.xrayVersion || '-'}</td>
                        <td className={cn(TD, 'text-center')}>
                          <div className="flex items-center justify-center gap-1.5">
                            <span>{record.panelVersion || '-'}</span>
                            {canUpdate && (
                              <Tooltip content={`${ t('pages.nodes.updateAvailable') }: ${ latestVersion }`}>
                                <button type="button" onClick={() => onUpdateNode(record)}>
                                  <Badge variant="warning" className="cursor-pointer">{t('pages.nodes.updateAvailable')}</Badge>
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className={cn(TD, 'text-center')}>{formatUptime(record.uptimeSecs)}</td>
                        <td className={cn(TD, 'text-center')}><ClientTags record={record} /></td>
                        <td className={cn(TD, 'text-center')}>
                          {record.latencyMs && record.latencyMs > 0 ? `${ record.latencyMs } ms` : '-'}
                        </td>
                        <td className={cn(TD, 'text-center')}>{relativeTime(record.lastHeartbeat)}</td>
                      </tr>
                      {expandable && (
                        <tr className="border-b border-border">
                          <td colSpan={showSelection ? 15 : 14} className="p-0">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(record.id)}
                              aria-expanded={expanded}
                              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
                            >
                              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} aria-hidden />
                              {t('pages.nodes.cpu')} / {t('pages.nodes.mem')}
                            </button>
                            {expanded && (
                              <div className="px-3 pb-3">
                                <NodeHistoryPanel node={record} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </ExpandableRows>
                      );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    );
}

// Fragment wrapper so each logical node can emit a main row + an expander row
// while keeping a single React key.
function ExpandableRows({ children }: { children: ReactNode })
{
    return <>{children}</>;
}

function StatRow({ label, children }: { label: string; children: ReactNode })
{
    return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-24 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
    );
}
