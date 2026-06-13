import { useTranslation } from 'react-i18next';
import { AlarmClock } from 'lucide-react';

import { Badge, cn } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { TicketAttachment } from './AttachmentViewer';

export type TicketStatus =
  | 'open' | 'pending_user' | 'pending_staff' | 'in_progress' | 'escalated' | 'solved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Ticket {
  id: number;
  number: string;
  userId: number;
  categoryId: number;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: number;
  slaDueAt: number;
  firstResponseAt: number;
  lastReplyAt: number;
  messageCount: number;
  reopenCount: number;
  closedAt: number;
  createdAt: number;
  username: string;
  categoryName: string;
  assigneeName: string;
  overdue: boolean;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  userId: number;
  body: string;
  isInternal: boolean;
  isSystem: boolean;
  createdAt: number;
  authorName: string;
  authorRole: string;
  attachments: TicketAttachment[];
}

export const STATUS_VARIANT: Record<TicketStatus, BadgeVariant> = {
    open: 'primary',
    pending_staff: 'warning',
    pending_user: 'neutral',
    in_progress: 'primary',
    escalated: 'danger',
    solved: 'success',
    closed: 'neutral'
};

export const PRIORITY_VARIANT: Record<TicketPriority, BadgeVariant> = {
    low: 'neutral',
    normal: 'primary',
    high: 'warning',
    urgent: 'danger'
};

export function StatusBadge({ status }: { status: TicketStatus })
{
    const { t } = useTranslation();
    return <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{t(`pages.tickets.status_${ status }`, { defaultValue: status })}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority })
{
    const { t } = useTranslation();
    return <Badge variant={PRIORITY_VARIANT[priority] ?? 'neutral'}>{t(`pages.tickets.priority_${ priority }`, { defaultValue: priority })}</Badge>;
}

function humanizeMs(ms: number): string
{
    const mins = Math.round(ms / 60000);
    if (mins < 60)
    {
        return `${ mins }m`;
    }
    const hrs = Math.round(mins / 60);
    if (hrs < 48)
    {
        return `${ hrs }h`;
    }
    return `${ Math.round(hrs / 24) }d`;
}

/** SLA chip: shows time-to-first-response remaining, or "overdue" once breached.
 *  Hidden once the ticket has been answered or is closed. */
export function SlaBadge({ ticket, now }: { ticket: Ticket; now: number })
{
    const { t } = useTranslation();
    if (ticket.firstResponseAt > 0 || ticket.slaDueAt <= 0 || ticket.status === 'solved' || ticket.status === 'closed')
    {
        return null;
    }
    const remaining = ticket.slaDueAt - now;
    const overdue = remaining < 0;
    return (
    <span
      className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          overdue ? 'bg-danger-subtle text-danger' : 'bg-surface-sunken text-muted-foreground'
      )}
      title={t('pages.tickets.slaTooltip')}
    >
      <AlarmClock className="h-3 w-3" aria-hidden />
      {overdue
          ? t('pages.tickets.slaOverdue', { time: humanizeMs(-remaining) })
          : t('pages.tickets.slaLeft', { time: humanizeMs(remaining) })}
    </span>
    );
}
