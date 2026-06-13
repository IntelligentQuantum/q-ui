import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, LayoutDashboard, Plus } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe } from '@/hooks/useMe';
import { HttpUtil, IntlUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Button,
    Card,
    CardContent,
    Label,
    Modal,
    SearchInput,
    Select,
    Table,
    Textarea,
    cn
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { PriorityBadge, SlaBadge, StatusBadge, type Ticket } from '@/components/tickets/badges';
import FileDropZone from '@/components/tickets/FileDropZone';

const PAGE_SIZE = 15;

interface Category { id: number; name: string; }
interface ListResult { items: Ticket[]; total: number; }

const STAFF_FILTERS = ['all', 'open', 'assigned_to_me', 'unassigned', 'escalated', 'urgent', 'closed', 'today', 'week'];
const USER_FILTERS = ['all', 'open', 'closed'];

export default function TicketsPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { can } = useMe();
    const isStaff = can('ticket.manage');
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();

    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [now] = useState(() => Date.now());

    useEffect(() =>
    {
        setPage(0);
    }, [filter, search]);

    const categoriesQuery = useQuery({
        queryKey: ['tickets', 'categories'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/tickets/categories', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Category[]) ?? []) : [];
        }
    });

    const listQuery = useQuery({
        queryKey: ['tickets', 'list', filter, search, page],
        queryFn: async () =>
        {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
            if (filter !== 'all')
            {
                params.set('filter', filter);
            }
            if (search.trim())
            {
                params.set('search', search.trim());
            }
            const msg = await HttpUtil.get(`/panel/api/tickets?${ params.toString() }`, undefined, { silent: true });
            return msg?.success ? (msg.obj as ListResult) : { items: [], total: 0 };
        }
    });

    const result = listQuery.data ?? { items: [], total: 0 };
    const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

    const filterOptions = useMemo(
        () => (isStaff ? STAFF_FILTERS : USER_FILTERS).map((f) => ({ value: f, label: t(`pages.tickets.filter_${ f }`) })),
        [isStaff, t]
    );

    // ----- create modal -----
    const [createOpen, setCreateOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [priority, setPriority] = useState('normal');
    const [body, setBody] = useState('');
    const [files, setFiles] = useState<File[]>([]);

    const createMut = useMutation({
        mutationFn: () =>
        {
            const fd = new FormData();
            fd.append('subject', subject);
            fd.append('categoryId', categoryId);
            fd.append('priority', priority);
            fd.append('body', body);
            files.forEach((f) => fd.append('attachments', f));
            return HttpUtil.post('/panel/api/tickets', fd, { silent: true });
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                const id = (msg.obj as { id?: number } | null)?.id;
                messageApi.success(t('pages.tickets.toasts.created'));
                setCreateOpen(false);
                setSubject(''); setCategoryId(''); setPriority('normal'); setBody(''); setFiles([]);
                queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
                if (id)
                {
                    navigate(`/tickets/${ id }`);
                }
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    function submitCreate()
    {
        if (!subject.trim() || !categoryId || !body.trim())
        {
            messageApi.error(t('pages.tickets.toasts.invalid'));
            return;
        }
        createMut.mutate();
    }

    const columns: Column<Ticket>[] = [
        {
            key: 'number',
            header: t('pages.tickets.number'),
            cell: (r) => <span className="font-mono text-xs" dir="ltr">{r.number}</span>
        },
        {
            key: 'subject',
            header: t('pages.tickets.subject'),
            cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.subject}</span>
          <span className="text-xs text-muted-foreground">{r.categoryName}{r.messageCount > 1 ? ` · ${ r.messageCount }` : ''}</span>
        </div>
            )
        },
        ...(isStaff
            ? [{
                key: 'requester',
                header: t('pages.tickets.requester'),
                className: 'hidden md:table-cell',
                cell: (r: Ticket) => <span className="text-sm">{r.username || `#${ r.userId }`}</span>
            }]
            : []),
        {
            key: 'status',
            header: t('pages.tickets.statusLabel'),
            cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} />
          <SlaBadge ticket={r} now={now} />
        </div>
            )
        },
        {
            key: 'priority',
            header: t('pages.tickets.priorityLabel'),
            className: 'hidden sm:table-cell',
            cell: (r) => <PriorityBadge priority={r.priority} />
        },
        ...(isStaff
            ? [{
                key: 'assignee',
                header: t('pages.tickets.assignee'),
                className: 'hidden lg:table-cell',
                cell: (r: Ticket) => (r.assignedTo ? <span className="text-sm">{r.assigneeName}</span> : <span className="text-xs text-muted-foreground">{t('pages.tickets.unassigned')}</span>)
            }]
            : []),
        {
            key: 'lastReplyAt',
            header: t('pages.tickets.lastActivity'),
            className: 'hidden sm:table-cell',
            cell: (r) => <span className="text-sm text-muted-foreground">{IntlUtil.formatDate(r.lastReplyAt || r.createdAt)}</span>
        }
    ];

    return (
    <PageShell
      title={t('pages.tickets.title')}
      description={t('pages.tickets.subtitle')}
      actions={
        <div className="flex items-center gap-2">
          {isStaff && (
            <Button variant="secondary" onClick={() => navigate('/support')}>
              <LayoutDashboard className="me-2 h-4 w-4" aria-hidden /> {t('menu.support')}
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" aria-hidden /> {t('pages.tickets.new')}
          </Button>
        </div>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-56">
              <Select value={filter} onChange={setFilter} options={filterOptions} aria-label={t('filter')} />
            </div>
            <div className="w-full sm:w-72">
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('pages.tickets.searchPlaceholder')} />
            </div>
          </div>

          <Table<Ticket>
            columns={columns}
            data={result.items ?? []}
            rowKey={(r) => String(r.id)}
            loading={listQuery.isFetching}
            pageSize={0}
            onRowClick={(r) => navigate(`/tickets/${ r.id }`)}
            empty={<div className="py-10 text-center text-muted-foreground">{t('pages.tickets.empty')}</div>}
          />

          {result.total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('pages.tickets.totalCount', { count: result.total })}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={page === 0} aria-label="prev" onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
                <span className="px-1 text-xs tabular-nums text-muted-foreground">{page + 1} / {pageCount}</span>
                <Button variant="ghost" size="icon" disabled={page >= pageCount - 1} aria-label="next" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create ticket */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('pages.tickets.new')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button loading={createMut.isPending} onClick={submitCreate}>{t('pages.tickets.submit')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-subject">{t('pages.tickets.subject')}</Label>
            <input
              id="tk-subject"
              className={cn('flex h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35')}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tk-category">{t('pages.tickets.category')}</Label>
              <Select
                id="tk-category"
                value={categoryId}
                onChange={setCategoryId}
                placeholder={t('pages.tickets.selectCategory')}
                options={(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tk-priority">{t('pages.tickets.priorityLabel')}</Label>
              <Select
                id="tk-priority"
                value={priority}
                onChange={setPriority}
                options={['low', 'normal', 'high', 'urgent'].map((p) => ({ value: p, label: t(`pages.tickets.priority_${ p }`) }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-body">{t('pages.tickets.message')}</Label>
            <Textarea id="tk-body" className="min-h-32" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('pages.tickets.messagePlaceholder')} />
            <span className="text-xs text-muted-foreground">{t('pages.tickets.formattingHint')}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('pages.tickets.attachments')}</Label>
            <FileDropZone files={files} onChange={setFiles} />
          </div>
        </div>
      </Modal>
    </PageShell>
    );
}
