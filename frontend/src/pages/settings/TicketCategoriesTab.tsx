import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';

import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { Badge, Button, Input, Label, Modal, Textarea, Tooltip, confirm } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface Category {
  id: number;
  name: string;
  description: string;
  displayOrder: number;
  status: string;
}

interface Form { name: string; description: string; }

// TicketCategoriesTab lives under Panel Settings → Ticket Categories: admins
// create/edit/delete/reorder/activate the configurable ticket categories.
export default function TicketCategoriesTab()
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['tickets', 'admin', 'categories'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/tickets/admin/categories', undefined, { silent: true });
            return msg?.success ? ((msg.obj as Category[]) ?? []) : [];
        }
    });
    const invalidate = () =>
    {
        queryClient.invalidateQueries({ queryKey: ['tickets', 'admin', 'categories'] });
        queryClient.invalidateQueries({ queryKey: ['tickets', 'categories'] });
    };
    const cats = query.data ?? [];

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [form, setForm] = useState<Form>({ name: '', description: '' });

    const saveMut = useMutation({
        mutationFn: () =>
        {
            const url = editing
                ? `/panel/api/tickets/admin/categories/${ editing.id }`
                : '/panel/api/tickets/admin/categories';
            const order = editing ? editing.displayOrder : cats.length;
            return HttpUtil.post(url, { ...form, displayOrder: order }, JSON_HEADERS);
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                messageApi.success(t('pages.ticketAdmin.toasts.saved'));
                setOpen(false);
                invalidate();
            }
            else
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
            }
        }
    });

    const statusMut = useMutation({
        mutationFn: (p: { id: number; active: boolean }) =>
            HttpUtil.post(`/panel/api/tickets/admin/categories/${ p.id }/status`, { active: p.active }, JSON_HEADERS),
        onSuccess: (msg) => msg?.success && invalidate()
    });

    const reorderMut = useMutation({
        mutationFn: (ids: number[]) => HttpUtil.post('/panel/api/tickets/admin/categories/reorder', { ids }, JSON_HEADERS),
        onSuccess: (msg) => msg?.success && invalidate()
    });

    function move(index: number, dir: -1 | 1)
    {
        const next = [...cats];
        const target = index + dir;
        if (target < 0 || target >= next.length)
        {
            return;
        }
        [next[index], next[target]] = [next[target], next[index]];
        reorderMut.mutate(next.map((c) => c.id));
    }

    async function onDelete(cat: Category)
    {
        const ok = await confirm({
            title: t('pages.ticketAdmin.deleteTitle'),
            description: t('pages.ticketAdmin.deleteContent', { name: cat.name }),
            confirmText: t('remove'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/tickets/admin/categories/${ cat.id }/del`, {}, JSON_HEADERS);
        if (msg?.success)
        {
            messageApi.success(t('pages.ticketAdmin.toasts.deleted'));
            invalidate();
        }
        else
        {
            messageApi.error(msg?.msg || t('somethingWentWrong'));
        }
    }

    return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent" aria-hidden />
          <h3 className="text-base font-semibold">{t('pages.ticketAdmin.title')}</h3>
        </div>
        <Button onClick={() =>
        {
            setEditing(null); setForm({ name: '', description: '' }); setOpen(true);
        }}>
          <Plus className="me-2 h-4 w-4" aria-hidden /> {t('pages.ticketAdmin.add')}
        </Button>
      </div>

      {cats.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{t('pages.ticketAdmin.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cats.map((cat, i) => (
            <li key={cat.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-col">
                <button type="button" aria-label="move up" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" aria-label="move down" disabled={i === cats.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{cat.name}</span>
                  <Badge variant={cat.status === 'active' ? 'success' : 'neutral'}>
                    {cat.status === 'active' ? t('pages.adminDeposits.active') : t('pages.adminDeposits.inactive')}
                  </Badge>
                </div>
                {cat.description && <p className="truncate text-sm text-muted-foreground">{cat.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content={cat.status === 'active' ? t('pages.adminDeposits.inactive') : t('pages.adminDeposits.active')}>
                  <Button variant="ghost" size="icon" aria-label="toggle" onClick={() => statusMut.mutate({ id: cat.id, active: cat.status !== 'active' })}>
                    {cat.status === 'active' ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  </Button>
                </Tooltip>
                <Button variant="ghost" size="icon" aria-label={t('update')} onClick={() =>
                {
                    setEditing(cat); setForm({ name: cat.name, description: cat.description }); setOpen(true);
                }}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t('remove')} onClick={() => onDelete(cat)}>
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('pages.ticketAdmin.edit') : t('pages.ticketAdmin.add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button loading={saveMut.isPending} onClick={() =>
            {
                if (!form.name.trim())
                {
                    messageApi.error(t('somethingWentWrong'));
                    return;
                }
                saveMut.mutate();
            }}>{t('save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">{t('pages.ticketAdmin.name')}</Label>
            <Input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-desc">{t('pages.ticketAdmin.descLabel')}</Label>
            <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
    );
}
