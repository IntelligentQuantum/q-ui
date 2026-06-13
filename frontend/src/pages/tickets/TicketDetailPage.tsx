import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, RotateCcw, Send, ShieldAlert, UserCheck } from 'lucide-react';

import { usePageTitle } from '@/hooks/usePageTitle';
import { useMe } from '@/hooks/useMe';
import { HttpUtil, IntlUtil } from '@/utils';
import { renderMarkdown } from '@/utils/safeMarkdown';
import { message } from '@/components/ui/message';
import { setMessageInstance } from '@/utils/messageBus';
import PageShell from '@/layouts/PageShell';
import {
    Badge,
    Button,
    Card,
    CardContent,
    Checkbox,
    Label,
    Select,
    Spinner,
    Textarea,
    cn
} from '@/components/ui';
import {
    PriorityBadge,
    SlaBadge,
    StatusBadge,
    type Ticket,
    type TicketMessage
} from '@/components/tickets/badges';
import AttachmentViewer from '@/components/tickets/AttachmentViewer';
import FileDropZone from '@/components/tickets/FileDropZone';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;
const STATUSES = ['open', 'pending_staff', 'pending_user', 'in_progress', 'escalated', 'solved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

interface DetailData { ticket: Ticket; messages: TicketMessage[]; canManage: boolean; }
interface Staff { id: number; username: string; role: string; }
interface Category { id: number; name: string; }

function initials(name: string): string
{
    return (name || '?').trim().slice(0, 2).toUpperCase();
}

export default function TicketDetailPage()
{
    usePageTitle();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const ticketId = Number(id);
    const { me, can } = useMe();
    const isStaff = can('ticket.manage');
    const [messageApi] = message.useMessage();
    useEffect(() =>
    {
        setMessageInstance(messageApi);
    }, [messageApi]);
    const queryClient = useQueryClient();
    const now = Date.now();

    const detailQuery = useQuery({
        queryKey: ['tickets', 'detail', ticketId],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get(`/panel/api/tickets/${ ticketId }`, undefined, { silent: true });
            if (!msg?.success)
            {
                throw new Error(msg?.msg || 'not found');
            }
            return msg.obj as DetailData;
        },
        enabled: ticketId > 0
    });

    const staffQuery = useQuery({
        queryKey: ['tickets', 'staff'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/tickets/staff', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Staff[]) ?? []) : [];
        },
        enabled: isStaff
    });
    const categoriesQuery = useQuery({
        queryKey: ['tickets', 'categories'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/tickets/categories', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Category[]) ?? []) : [];
        },
        enabled: isStaff
    });

    const refresh = () =>
    {
        queryClient.invalidateQueries({ queryKey: ['tickets', 'detail', ticketId] });
        queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
    };

    // ----- reply composer -----
    const [body, setBody] = useState('');
    const [internal, setInternal] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const threadEndRef = useRef<HTMLDivElement>(null);

    const data = detailQuery.data;
    const ticket = data?.ticket;
    const messages = useMemo(() => data?.messages ?? [], [data]);

    useEffect(() =>
    {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages.length]);

    const replyMut = useMutation({
        mutationFn: () =>
        {
            const fd = new FormData();
            fd.append('body', body);
            if (internal)
            {
                fd.append('internal', 'true');
            }
            files.forEach((f) => fd.append('attachments', f));
            return HttpUtil.post(`/panel/api/tickets/${ ticketId }/messages`, fd, { silent: true });
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                setBody(''); setFiles([]); setInternal(false);
                refresh();
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    function action(url: string, payload: object, okMsg?: string)
    {
        return HttpUtil.post(url, payload, JSON_HEADERS).then((msg) =>
        {
            if (msg?.success)
            {
                if (okMsg)
                {
                    messageApi.success(okMsg);
                }
                refresh();
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        });
    }

    if (detailQuery.isLoading)
    {
        return (
      <PageShell title={t('pages.ticketDetail.title')}>
        <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>
      </PageShell>
        );
    }
    if (!ticket)
    {
        return (
      <PageShell title={t('pages.ticketDetail.title')}>
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('pages.tickets.toasts.notFound')}</CardContent></Card>
      </PageShell>
        );
    }

    const isClosed = ticket.status === 'solved' || ticket.status === 'closed';

    return (
    <PageShell title={null}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label={t('pages.tickets.title')} onClick={() => navigate('/tickets')}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Button>
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">{ticket.number}</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <SlaBadge ticket={ticket} now={now} />
              {ticket.categoryName && <Badge variant="outline">{ticket.categoryName}</Badge>}
              {isStaff && ticket.username && <span className="text-xs text-muted-foreground">· {ticket.username}</span>}
              <span className="text-xs text-muted-foreground">· {IntlUtil.formatDate(ticket.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Conversation */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {messages.map((m) =>
            {
                const mine = m.userId === me?.id;
                const staffAuthor = m.authorRole === 'admin' || m.authorRole === 'moderator';
                return (
              <div
                key={m.id}
                className={cn(
                    'rounded-lg border p-3 sm:p-4',
                    m.isInternal
                        ? 'border-warning/40 bg-warning-subtle/40'
                        : 'border-border bg-surface'
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
                      staffAuthor ? 'bg-accent-subtle text-accent' : 'bg-surface-sunken text-muted-foreground')}>
                    {initials(m.authorName)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {m.authorName || t('pages.tickets.requester')}
                      {staffAuthor && <Badge variant="primary">{t(`pages.users.role_${ m.authorRole }`, { defaultValue: m.authorRole })}</Badge>}
                      {mine && <span className="text-xs text-muted-foreground">({t('pages.ticketDetail.you')})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{IntlUtil.formatDate(m.createdAt)}</span>
                  </div>
                  {m.isInternal && (
                    <Badge variant="warning" className="ms-auto">
                      <Lock className="h-3 w-3" aria-hidden /> {t('pages.ticketDetail.internalNote')}
                    </Badge>
                  )}
                </div>
                <div
                  className="ticket-prose text-sm leading-relaxed text-foreground [&_a]:text-accent [&_blockquote]:my-1 [&_li]:my-0.5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-2"
                  // Safe: renderMarkdown HTML-escapes all input first, then injects
                  // only its own known tags with validated hrefs (see safeMarkdown).
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }}
                />
                <AttachmentViewer ticketId={ticketId} attachments={m.attachments} />
              </div>
                );
            })}
            <div ref={threadEndRef} />

            {/* Composer */}
            <Card>
              <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
                {isClosed && !isStaff ? (
                  <div className="flex flex-col items-center gap-2 py-3 text-center">
                    <p className="text-sm text-muted-foreground">{t('pages.ticketDetail.closedNote')}</p>
                    <Button variant="secondary" onClick={() => action(`/panel/api/tickets/${ ticketId }/reopen`, {}, t('pages.tickets.toasts.reopened'))}>
                      <RotateCcw className="me-2 h-4 w-4" aria-hidden /> {t('pages.ticketDetail.reopen')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <Textarea
                      className="min-h-24"
                      placeholder={internal ? t('pages.ticketDetail.internalPlaceholder') : t('pages.ticketDetail.replyPlaceholder')}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                    <FileDropZone files={files} onChange={setFiles} compact />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {isStaff ? (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox checked={internal} onChange={() => setInternal((v) => !v)} />
                          {t('pages.ticketDetail.markInternal')}
                        </label>
                      ) : <span />}
                      <div className="flex items-center gap-2">
                        {isClosed && isStaff && (
                          <Button variant="secondary" onClick={() => action(`/panel/api/tickets/${ ticketId }/reopen`, {}, t('pages.tickets.toasts.reopened'))}>
                            <RotateCcw className="me-2 h-4 w-4" aria-hidden /> {t('pages.ticketDetail.reopen')}
                          </Button>
                        )}
                        <Button
                          loading={replyMut.isPending}
                          disabled={!body.trim() && files.length === 0}
                          onClick={() =>
                          {
                              if (!body.trim())
                              {
                                  messageApi.error(t('pages.tickets.toasts.invalid'));
                                  return;
                              }
                              replyMut.mutate();
                          }}
                        >
                          <Send className="me-2 h-4 w-4" aria-hidden /> {t('pages.ticketDetail.send')}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Staff action panel */}
          {isStaff && (
            <aside className="flex shrink-0 flex-col gap-3 lg:w-72">
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <h3 className="text-sm font-semibold text-foreground">{t('pages.ticketDetail.staffActions')}</h3>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tk-status">{t('pages.tickets.statusLabel')}</Label>
                    <Select
                      id="tk-status"
                      value={ticket.status}
                      onChange={(v) => action(`/panel/api/tickets/${ ticketId }/status`, { status: v })}
                      options={STATUSES.map((s) => ({ value: s, label: t(`pages.tickets.status_${ s }`) }))}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tk-pri">{t('pages.tickets.priorityLabel')}</Label>
                    <Select
                      id="tk-pri"
                      value={ticket.priority}
                      onChange={(v) => action(`/panel/api/tickets/${ ticketId }/priority`, { priority: v })}
                      options={PRIORITIES.map((p) => ({ value: p, label: t(`pages.tickets.priority_${ p }`) }))}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tk-assignee">{t('pages.tickets.assignee')}</Label>
                    <Select
                      id="tk-assignee"
                      value={String(ticket.assignedTo || '')}
                      placeholder={t('pages.tickets.unassigned')}
                      onChange={(v) => action(`/panel/api/tickets/${ ticketId }/assign`, { assignedTo: Number(v) || 0 })}
                      options={[
                          { value: '0', label: t('pages.tickets.unassigned') },
                          ...(staffQuery.data ?? []).map((s) => ({ value: String(s.id), label: s.username }))
                      ]}
                    />
                    {me && ticket.assignedTo !== me.id && (
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        onClick={() => action(`/panel/api/tickets/${ ticketId }/assign`, { assignedTo: me.id }, t('pages.ticketDetail.assignedToMe'))}
                      >
                        <UserCheck className="h-3.5 w-3.5" aria-hidden /> {t('pages.ticketDetail.assignToMe')}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tk-cat">{t('pages.ticketDetail.transferCategory')}</Label>
                    <Select
                      id="tk-cat"
                      value={String(ticket.categoryId || '')}
                      onChange={(v) => action(`/panel/api/tickets/${ ticketId }/transfer`, { categoryId: Number(v), assignedTo: ticket.assignedTo }, t('pages.ticketDetail.transferred'))}
                      options={(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
                    />
                  </div>

                  {ticket.status !== 'escalated' && !isClosed && (
                    <Button variant="danger" onClick={() => action(`/panel/api/tickets/${ ticketId }/escalate`, {}, t('pages.ticketDetail.escalated'))}>
                      <ShieldAlert className="me-2 h-4 w-4" aria-hidden /> {t('pages.ticketDetail.escalate')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      </div>
    </PageShell>
    );
}
