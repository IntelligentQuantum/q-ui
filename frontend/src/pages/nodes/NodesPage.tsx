import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import { message } from '@/components/ui/message';
import { CircleCheck, CircleX, Cloud, Plus, Zap } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNodesQuery } from '@/api/queries/useNodesQuery';
import type { NodeRecord } from '@/api/queries/useNodesQuery';
import { useNodeMutations } from '@/api/queries/useNodeMutations';
import PageShell from '@/layouts/PageShell';
import NodeList from './NodeList';
import NodeFormModal from './NodeFormModal';
import { setMessageInstance } from '@/utils/messageBus';
import { HttpUtil } from '@/utils';
import { Button, ErrorState, Spinner, confirm } from '@/components/ui';
import type { PanelUpdateInfo } from '../index/PanelUpdateModal';

export default function NodesPage()
{
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const { isMobile } = useMediaQuery();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);

    const { nodes, loading, fetched, fetchError, refetch, totals } = useNodesQuery();
    const { create, update, remove, setEnable, testConnection, fetchFingerprint, probe, updatePanels } = useNodeMutations();

    const { data: latestVersion = '' } = useQuery({
        queryKey: ['server', 'panelUpdateInfo'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get<PanelUpdateInfo>('/panel/api/server/getPanelUpdateInfo');
            return msg?.obj?.latestVersion || '';
        },
        staleTime: 5 * 60 * 1000
    });

    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
    const [formNode, setFormNode] = useState<NodeRecord | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const onAdd = useCallback(() =>
    {
        setFormMode('add');
        setFormNode(null);
        setFormOpen(true);
    }, []);

    const onEdit = useCallback((node: NodeRecord) =>
    {
        setFormMode('edit');
        setFormNode({ ...node });
        setFormOpen(true);
    }, []);

    const onSave = useCallback(async (payload: Partial<NodeRecord>) =>
    {
        if (formMode === 'edit' && formNode?.id)
        {
            return update(formNode.id, payload);
        }
        return create(payload);
    }, [formMode, formNode, update, create]);

    const onDelete = useCallback(async (node: NodeRecord) =>
    {
        const ok = await confirm({
            title: t('pages.nodes.deleteConfirmTitle', { name: node.name }),
            description: t('pages.nodes.deleteConfirmContent'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await remove(node.id);
        if (msg?.success)
        {
            messageApi.success(t('pages.nodes.toasts.deleted'));
        }
    }, [t, remove, messageApi]);

    const onProbe = useCallback(async (node: NodeRecord) =>
    {
        const msg = await probe(node.id);
        if (msg?.success && msg.obj)
        {
            if (msg.obj.status === 'online')
            {
                messageApi.success(t('pages.nodes.connectionOk', { ms: msg.obj.latencyMs }));
            }
            else
            {
                messageApi.error(msg.obj.error || t('pages.nodes.toasts.probeFailed'));
            }
        }
    }, [probe, t, messageApi]);

    const onToggleEnable = useCallback(async (node: NodeRecord, next: boolean) =>
    {
        await setEnable(node.id, next);
    }, [setEnable]);

    const runUpdate = useCallback(async (ids: number[]) =>
    {
        const msg = await updatePanels(ids);
        if (!msg?.success)
        {
            messageApi.error(msg?.msg || t('somethingWentWrong'));
            return;
        }
        const results = msg.obj ?? [];
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        if (failed === 0)
        {
            messageApi.success(t('pages.nodes.toasts.updateStarted'));
        }
        else
        {
            const firstError = results.find((r) => !r.ok)?.error ?? '';
            const base = t('pages.nodes.toasts.updateResult', { ok, failed });
            messageApi.warning(firstError ? `${ base } — ${ firstError }` : base);
        }
        setSelectedIds([]);
    }, [updatePanels, messageApi, t]);

    const onUpdateNode = useCallback(async (node: NodeRecord) =>
    {
        const ok = await confirm({
            title: t('pages.nodes.updateConfirmTitle', { count: 1 }),
            description: t('pages.nodes.updateConfirmContent'),
            confirmText: t('update'),
            cancelText: t('cancel')
        });
        if (ok)
        {
            runUpdate([node.id]);
        }
    }, [t, runUpdate]);

    const onUpdateSelected = useCallback(async () =>
    {
        const eligible = nodes
            .filter((n) => selectedIds.includes(n.id) && n.enable && n.status === 'online')
            .map((n) => n.id);
        if (eligible.length === 0)
        {
            messageApi.warning(t('pages.nodes.toasts.updateNoneEligible'));
            return;
        }
        const ok = await confirm({
            title: t('pages.nodes.updateConfirmTitle', { count: eligible.length }),
            description: t('pages.nodes.updateConfirmContent'),
            confirmText: t('update'),
            cancelText: t('cancel')
        });
        if (ok)
        {
            runUpdate(eligible);
        }
    }, [t, nodes, selectedIds, runUpdate, messageApi]);

    const pageClass = useMemo(() => `nodes-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    return (
    <PageShell
      name={pageClass}
      actions={
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.nodes.addNode')}
        </Button>
      }
    >
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : fetchError ? (
              <ErrorState message={fetchError} onRetry={() => refetch()} />
            ) : (
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                  <StatCard
                    title={t('pages.nodes.totalNodes')}
                    value={String(totals.total)}
                    icon={<Cloud className="h-5 w-5" aria-hidden />}
                  />
                  <StatCard
                    title={t('pages.nodes.onlineNodes')}
                    value={String(totals.online)}
                    icon={<CircleCheck className="h-5 w-5 text-success" aria-hidden />}
                  />
                  <StatCard
                    title={t('pages.nodes.offlineNodes')}
                    value={String(totals.offline)}
                    icon={<CircleX className="h-5 w-5 text-danger" aria-hidden />}
                  />
                  <StatCard
                    title={t('pages.nodes.avgLatency')}
                    value={totals.avgLatency > 0 ? `${ totals.avgLatency } ms` : '-'}
                    icon={<Zap className="h-5 w-5" aria-hidden />}
                  />
                </div>

                <NodeList
                  nodes={nodes}
                  loading={loading}
                  isMobile={isMobile}
                  latestVersion={latestVersion}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onProbe={onProbe}
                  onToggleEnable={onToggleEnable}
                  onUpdateNode={onUpdateNode}
                  onUpdateSelected={onUpdateSelected}
                />
              </div>
            )}

        <NodeFormModal
          open={formOpen}
          mode={formMode}
          node={formNode}
          testConnection={testConnection}
          fetchFingerprint={fetchFingerprint}
          save={onSave}
          onOpenChange={setFormOpen}
        />
    </PageShell>
    );
}
