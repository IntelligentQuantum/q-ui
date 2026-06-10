import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput, StatCard } from '@/components/ui';
import {
    Clock,
    Link as LinkIcon,
    Pencil,
    Plus,
    RefreshCw,
    Tags,
    Trash2,
    Users,
    UserMinus,
    UserPlus,
    CircleX
} from 'lucide-react';
import { message } from '@/components/ui/message';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { useTheme } from '@/hooks/useTheme';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useClients } from '@/hooks/useClients';
import { HttpUtil } from '@/utils';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import { LazyMount } from '@/components/utility';
import { keys } from '@/api/queryKeys';
import {
    ClientRecordSchema,
    GroupSummaryListSchema,
    type ClientRecord,
    type GroupSummary
} from '@/schemas/client';
import { parseMsg } from '@/utils/zodValidate';
import {
    Badge,
    Button,
    Card,
    CardContent,
    DropdownMenu,
    Input,
    Label,
    Modal,
    Spinner,
    Table,
    Tooltip,
    confirm
} from '@/components/ui';
import type { Column, DropdownItem } from '@/components/ui';

const ClientRecordListSchema = z.array(ClientRecordSchema).nullable().transform((v) => v ?? []);

const SubLinksModal = lazy(() => import('../clients/SubLinksModal'));
const ClientBulkAdjustModal = lazy(() => import('../clients/ClientBulkAdjustModal'));
const GroupAddClientsModal = lazy(() => import('./GroupAddClientsModal'));
const GroupRemoveClientsModal = lazy(() => import('./GroupRemoveClientsModal'));

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

async function fetchGroups(): Promise<GroupSummary[]>
{
    const msg = await HttpUtil.get('/panel/api/clients/groups', undefined, { silent: true });
    if (!msg?.success)
    {
        throw new Error(msg?.msg || 'Failed to load groups');
    }
    const validated = parseMsg(msg, GroupSummaryListSchema, 'clients/groups');
    return validated.obj ?? [];
}

async function fetchEmailsForGroup(name: string): Promise<string[]>
{
    const msg = await HttpUtil.get<string[]>(
        `/panel/api/clients/groups/${ encodeURIComponent(name) }/emails`,
        undefined,
        { silent: true }
    );
    if (!msg?.success || !Array.isArray(msg.obj))
    {
        return [];
    }
    return msg.obj;
}

export default function GroupsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const { subSettings, bulkAdjust, bulkAddToGroup, bulkRemoveFromGroup, bulkDelete } = useClients();

    const groupsQuery = useQuery({
        queryKey: keys.clients.groups(),
        queryFn: fetchGroups
    });
    const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
    const [search, setSearch] = useState('');
    const filteredGroups = useMemo(() =>
    {
        const needle = search.trim().toLowerCase();
        if (!needle)
        {
            return groups;
        }
        return groups.filter((g) => g.name.toLowerCase().includes(needle));
    }, [groups, search]);
    const loading = groupsQuery.isFetching;
    const fetched = groupsQuery.data !== undefined || groupsQuery.isError;
    const fetchError = groupsQuery.error ? (groupsQuery.error as Error).message : '';

    const invalidate = useCallback(() =>
    {
        queryClient.invalidateQueries({ queryKey: keys.clients.root() });
    }, [queryClient]);

    const createMut = useMutation({
        mutationFn: (body: { name: string }) =>
            HttpUtil.post('/panel/api/clients/groups/create', body, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
            }
        }
    });

    const renameMut = useMutation({
        mutationFn: (body: { oldName: string; newName: string }) =>
            HttpUtil.post('/panel/api/clients/groups/rename', body, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
            }
        }
    });

    const deleteMut = useMutation({
        mutationFn: (body: { name: string }) =>
            HttpUtil.post('/panel/api/clients/groups/delete', body, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
            }
        }
    });

    const bulkResetMut = useMutation({
        mutationFn: (body: { emails: string[] }) =>
            HttpUtil.post('/panel/api/clients/bulkResetTraffic', body, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
            }
        }
    });

    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState('');

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<GroupSummary | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const [subLinksOpen, setSubLinksOpen] = useState(false);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [addClientsOpen, setAddClientsOpen] = useState(false);
    const [removeClientsOpen, setRemoveClientsOpen] = useState(false);
    const [groupEmails, setGroupEmails] = useState<string[]>([]);
    const [groupForAction, setGroupForAction] = useState<GroupSummary | null>(null);

    const allClientsQuery = useQuery<ClientRecord[]>({
        queryKey: keys.clients.all(),
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/clients/list', undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || 'Failed to load clients');
            }
            const validated = parseMsg(msg, ClientRecordListSchema, 'clients/list');
            return validated.obj ?? [];
        },
        enabled: addClientsOpen || removeClientsOpen || subLinksOpen,
        staleTime: 30_000
    });
    const allClients = allClientsQuery.data ?? [];

    const totalGroups = groups.length;
    const totalClients = useMemo(
        () => groups.reduce((acc, g) => acc + (g.clientCount || 0), 0),
        [groups]
    );
    const emptyGroups = useMemo(
        () => groups.filter((g) => (g.clientCount || 0) === 0).length,
        [groups]
    );

    function openCreate()
    {
        setCreateName('');
        setCreateOpen(true);
    }

    async function confirmCreate()
    {
        const name = createName.trim();
        if (!name)
        {
            return;
        }
        if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase()))
        {
            messageApi.error(t('pages.groups.renameCollision', { name }));
            return;
        }
        const msg = await createMut.mutateAsync({ name });
        if (msg?.success)
        {
            messageApi.success(t('pages.groups.createSuccess', { name }));
            setCreateOpen(false);
        }
    }

    function openRename(g: GroupSummary)
    {
        setRenameTarget(g);
        setRenameValue(g.name);
        setRenameOpen(true);
    }

    async function confirmRename()
    {
        if (!renameTarget)
        {
            return;
        }
        const next = renameValue.trim();
        if (!next || next === renameTarget.name)
        {
            setRenameOpen(false);
            return;
        }
        if (groups.some((g) => g.name.toLowerCase() === next.toLowerCase() && g.name !== renameTarget.name))
        {
            messageApi.error(t('pages.groups.renameCollision', { name: next }));
            return;
        }
        const msg = await renameMut.mutateAsync({ oldName: renameTarget.name, newName: next });
        if (msg?.success)
        {
            const affected = (msg.obj as { affected?: number } | undefined)?.affected ?? 0;
            messageApi.success(t('pages.groups.renameSuccess', { count: affected }));
            setRenameOpen(false);
        }
    }

    async function onDelete(g: GroupSummary)
    {
        const ok = await confirm({
            title: t('pages.groups.deleteConfirmTitle', { name: g.name }),
            description: t('pages.groups.deleteConfirmContent', { count: g.clientCount }),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await deleteMut.mutateAsync({ name: g.name });
        if (msg?.success)
        {
            const affected = (msg.obj as { affected?: number } | undefined)?.affected ?? 0;
            messageApi.success(t('pages.groups.deleteSuccess', { count: affected }));
        }
    }

    async function openSubLinksFor(g: GroupSummary)
    {
        if (!g.clientCount)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        const emails = await fetchEmailsForGroup(g.name);
        if (emails.length === 0)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        setGroupForAction(g);
        setGroupEmails(emails);
        setSubLinksOpen(true);
    }

    async function openAdjustFor(g: GroupSummary)
    {
        if (!g.clientCount)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        const emails = await fetchEmailsForGroup(g.name);
        if (emails.length === 0)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        setGroupForAction(g);
        setGroupEmails(emails);
        setAdjustOpen(true);
    }

    function openAddClientsFor(g: GroupSummary)
    {
        setGroupForAction(g);
        setAddClientsOpen(true);
    }

    function openRemoveClientsFor(g: GroupSummary)
    {
        if (!g.clientCount)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        setGroupForAction(g);
        setRemoveClientsOpen(true);
    }

    async function onDeleteClients(g: GroupSummary)
    {
        if (!g.clientCount)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        const ok = await confirm({
            title: t('pages.groups.deleteClientsConfirmTitle', { name: g.name }),
            description: t('pages.groups.deleteClientsConfirmContent', { count: g.clientCount }),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const emails = await fetchEmailsForGroup(g.name);
        if (emails.length === 0)
        {
            return;
        }
        const msg = await bulkDelete(emails);
        if (msg?.success)
        {
            const okCount = msg.obj?.deleted ?? 0;
            const skipped = msg.obj?.skipped ?? [];
            const failed = skipped.length;
            if (failed === 0)
            {
                messageApi.success(t('pages.groups.deleteClientsSuccess', { count: okCount }));
            }
            else
            {
                const firstError = skipped[0]?.reason ?? msg?.msg ?? '';
                messageApi.warning(firstError
                    ? `${ t('pages.groups.deleteClientsMixed', { ok: okCount, failed }) } — ${ firstError }`
                    : t('pages.groups.deleteClientsMixed', { ok: okCount, failed }));
            }
        }
    }

    async function onResetTraffic(g: GroupSummary)
    {
        if (!g.clientCount)
        {
            messageApi.info(t('pages.groups.emptyForAction'));
            return;
        }
        const ok = await confirm({
            title: t('pages.groups.resetConfirmTitle', { name: g.name }),
            description: t('pages.groups.resetConfirmContent', { count: g.clientCount }),
            confirmText: t('reset'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const emails = await fetchEmailsForGroup(g.name);
        if (emails.length === 0)
        {
            return;
        }
        const msg = await bulkResetMut.mutateAsync({ emails });
        if (msg?.success)
        {
            const affected = (msg.obj as { affected?: number } | undefined)?.affected ?? emails.length;
            messageApi.success(t('pages.groups.resetSuccess', { count: affected }));
        }
    }

    function rowActions(row: GroupSummary): DropdownItem[]
    {
        return [
            {
                key: 'subLinks',
                icon: <LinkIcon className="h-4 w-4" aria-hidden />,
                label: t('pages.clients.subLinksSelected', { count: row.clientCount || 0 }),
                disabled: !row.clientCount,
                onSelect: () => openSubLinksFor(row)
            },
            {
                key: 'adjust',
                icon: <Clock className="h-4 w-4" aria-hidden />,
                label: t('pages.clients.adjustSelected', { count: row.clientCount || 0 }),
                disabled: !row.clientCount,
                onSelect: () => openAdjustFor(row)
            },
            {
                key: 'reset',
                icon: <RefreshCw className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.resetTraffic'),
                disabled: !row.clientCount,
                onSelect: () => onResetTraffic(row)
            },
            {
                key: 'addClients',
                icon: <UserPlus className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.addToGroup'),
                onSelect: () => openAddClientsFor(row)
            },
            {
                key: 'rename',
                icon: <Pencil className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.rename'),
                onSelect: () => openRename(row)
            },
            { type: 'separator' },
            {
                key: 'removeClients',
                icon: <UserMinus className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.removeFromGroup'),
                danger: true,
                disabled: !row.clientCount,
                onSelect: () => openRemoveClientsFor(row)
            },
            {
                key: 'deleteClients',
                icon: <Trash2 className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.deleteClients'),
                danger: true,
                disabled: !row.clientCount,
                onSelect: () => onDeleteClients(row)
            },
            {
                key: 'delete',
                icon: <Trash2 className="h-4 w-4" aria-hidden />,
                label: t('pages.groups.deleteGroupOnly'),
                danger: true,
                onSelect: () => onDelete(row)
            }
        ];
    }

    const columns: Column<GroupSummary>[] = [
        {
            key: 'actions',
            header: t('pages.clients.actions'),
            width: 110,
            cell: (row) => (
        <div className="flex items-center gap-0.5">
          <DropdownMenu align="start" label={t('more')} items={rowActions(row)} />
          <Tooltip content={t('pages.groups.rename')}>
            <Button aria-label={t('pages.groups.rename')} variant="ghost" size="icon" onClick={() => openRename(row)}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
            )
        },
        {
            key: 'name',
            header: t('pages.groups.name'),
            accessor: (row) => row.name,
            sortable: true,
            cell: (row) => <Badge variant="primary">{row.name}</Badge>
        },
        {
            key: 'clientCount',
            header: t('pages.groups.clientCount'),
            width: 180,
            accessor: (row) => row.clientCount || 0,
            sortable: true,
            cell: (row) => <span className="tabular-nums">{row.clientCount || 0}</span>
        }
    ];

    const pageClass = useMemo(() => `groups-page${ isDark ? ' is-dark' : '' }`, [isDark]);

    return (
    <PageShell
      name={pageClass}
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.groups.addGroup')}
        </Button>
      }
    >
            {!fetched ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            ) : fetchError ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
                  <CircleX className="h-10 w-10 text-danger" aria-hidden />
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-semibold">{t('somethingWentWrong')}</span>
                    <span className="text-sm text-muted-foreground">{fetchError}</span>
                  </div>
                  <Button loading={loading} onClick={() => groupsQuery.refetch()}>{t('refresh')}</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <StatCard title={t('pages.groups.totalGroups')} value={String(totalGroups)} icon={<Tags className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.groups.totalGroupedClients')} value={String(totalClients)} icon={<Users className="h-5 w-5" aria-hidden />} />
                  <StatCard title={t('pages.groups.emptyGroups')} value={String(emptyGroups)} icon={<Tags className="h-5 w-5 opacity-60" aria-hidden />} />
                </div>

                <Card className="p-4 sm:p-5">
                  <div className="mb-3 flex justify-end">
                    <SearchInput
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label={t('pages.groups.searchPlaceholder', { defaultValue: 'Search groups…' })}
                      placeholder={t('pages.groups.searchPlaceholder', { defaultValue: 'Search groups…' })}
                      className="w-full max-w-[280px] sm:w-auto"
                    />
                  </div>
                  <Table<GroupSummary>
                    columns={columns}
                    data={filteredGroups}
                    rowKey={(row) => row.name}
                    loading={loading}
                    pageSize={10}
                    empty={
                      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                        <Tags className="h-8 w-8 opacity-50" aria-hidden />
                        <div>{t('noData')}</div>
                      </div>
                    }
                  />
                </Card>
              </div>
            )}

        {/* Create group */}
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={t('pages.groups.addGroup')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
              <Button onClick={confirmCreate} loading={createMut.isPending}>{t('create')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-create-name">{t('pages.groups.name')}</Label>
            <Input
              id="group-create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) =>
              {
                  if (e.key === 'Enter')
                  {
                      confirmCreate();
                  }
              }}
              placeholder={t('pages.clients.groupPlaceholder')}
              autoFocus
            />
          </div>
        </Modal>

        {/* Rename group */}
        <Modal
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          title={renameTarget ? t('pages.groups.renameTitle', { name: renameTarget.name }) : ''}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRenameOpen(false)}>{t('cancel')}</Button>
              <Button onClick={confirmRename} loading={renameMut.isPending}>{t('save')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-rename-name">{t('pages.groups.name')}</Label>
            <Input
              id="group-rename-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) =>
              {
                  if (e.key === 'Enter')
                  {
                      confirmRename();
                  }
              }}
              placeholder={t('pages.clients.groupPlaceholder')}
              autoFocus
            />
          </div>
        </Modal>

        <LazyMount when={subLinksOpen}>
          <SubLinksModal
            open={subLinksOpen}
            emails={groupEmails}
            clients={allClients}
            subSettings={subSettings}
            onOpenChange={setSubLinksOpen}
          />
        </LazyMount>

        <LazyMount when={adjustOpen}>
          <ClientBulkAdjustModal
            open={adjustOpen}
            count={groupEmails.length}
            onOpenChange={setAdjustOpen}
            onSubmit={async (addDays, addBytes) =>
            {
                const msg = await bulkAdjust(groupEmails, addDays, addBytes);
                if (msg?.success)
                {
                    const obj = msg.obj ?? { adjusted: 0 };
                    messageApi.success(
                        t('pages.groups.adjustSuccess', {
                            count: obj.adjusted ?? 0,
                            name: groupForAction?.name ?? ''
                        })
                    );
                    return obj;
                }
                return null;
            }}
          />
        </LazyMount>

        <LazyMount when={addClientsOpen}>
          <GroupAddClientsModal
            open={addClientsOpen}
            groupName={groupForAction?.name ?? null}
            candidates={allClients.filter((c) => c.group !== groupForAction?.name)}
            onClose={() => setAddClientsOpen(false)}
            onSubmit={async (emails) =>
            {
                const msg = await bulkAddToGroup(emails, groupForAction?.name ?? '');
                if (msg?.success)
                {
                    return (msg.obj as { affected?: number } | undefined) ?? { affected: 0 };
                }
                return null;
            }}
          />
        </LazyMount>

        <LazyMount when={removeClientsOpen}>
          <GroupRemoveClientsModal
            open={removeClientsOpen}
            groupName={groupForAction?.name ?? null}
            members={allClients.filter((c) => c.group === groupForAction?.name)}
            onClose={() => setRemoveClientsOpen(false)}
            onSubmit={async (emails) =>
            {
                const msg = await bulkRemoveFromGroup(emails);
                if (msg?.success)
                {
                    return (msg.obj as { affected?: number } | undefined) ?? { affected: 0 };
                }
                return null;
            }}
          />
        </LazyMount>
    </PageShell>
    );
}
