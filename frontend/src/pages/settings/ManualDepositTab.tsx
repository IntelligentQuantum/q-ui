import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Pencil, Plus, Trash2, X } from 'lucide-react';

import { HttpUtil } from '@/utils';
import { message } from '@/components/ui/message';
import { Badge, Button, Input, Label, Modal, Tooltip, confirm } from '@/components/ui';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } } as const;

interface PaymentCard {
  id: number;
  title: string;
  cardHolderName: string;
  cardNumber: string;
  bankName: string;
  iban: string;
  accountNumber: string;
  status: string;
  displayOrder: number;
}

interface CardForm {
  title: string;
  cardHolderName: string;
  cardNumber: string;
  bankName: string;
  iban: string;
  accountNumber: string;
  displayOrder: number;
}

const EMPTY_CARD: CardForm = {
    title: '',
    cardHolderName: '',
    cardNumber: '',
    bankName: '',
    iban: '',
    accountNumber: '',
    displayOrder: 0
};

// ManualDepositTab lives under Panel Settings → Manual Deposit. It manages the
// company payment cards buyers transfer to (their own table + CRUD endpoints),
// independent of the key-value settings save-all flow.
export default function ManualDepositTab()
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const queryClient = useQueryClient();

    const cardsQuery = useQuery({
        queryKey: ['admin', 'cards'],
        queryFn: async () =>
        {
            const msg = await HttpUtil.get('/panel/api/billing/admin/payment-cards', undefined, { silent: true });
            return msg?.success ? ((msg.obj as PaymentCard[]) ?? []) : [];
        }
    });
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'cards'] });

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PaymentCard | null>(null);
    const [form, setForm] = useState<CardForm>(EMPTY_CARD);

    function openCreate()
    {
        setEditing(null);
        setForm(EMPTY_CARD);
        setModalOpen(true);
    }
    function openEdit(card: PaymentCard)
    {
        setEditing(card);
        setForm({
            title: card.title,
            cardHolderName: card.cardHolderName,
            cardNumber: card.cardNumber,
            bankName: card.bankName,
            iban: card.iban,
            accountNumber: card.accountNumber,
            displayOrder: card.displayOrder
        });
        setModalOpen(true);
    }

    const saveMut = useMutation({
        mutationFn: () =>
        {
            const url = editing
                ? `/panel/api/billing/admin/payment-cards/${ editing.id }`
                : '/panel/api/billing/admin/payment-cards';
            return HttpUtil.post(url, form, JSON_HEADERS);
        },
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                messageApi.success(t('pages.adminDeposits.toasts.cardSaved'));
                setModalOpen(false);
                invalidate();
            }
            else
            {
                messageApi.error(msg?.msg || t('pages.adminDeposits.toasts.invalidCard'));
            }
        }
    });

    const statusMut = useMutation({
        mutationFn: (payload: { id: number; active: boolean }) =>
            HttpUtil.post(`/panel/api/billing/admin/payment-cards/${ payload.id }/status`, { active: payload.active }, JSON_HEADERS),
        onSuccess: (msg) =>
        {
            if (msg?.success)
            {
                invalidate();
            }
        }
    });

    async function onDelete(card: PaymentCard)
    {
        const ok = await confirm({
            title: t('pages.adminDeposits.deleteCardTitle'),
            description: t('pages.adminDeposits.deleteCardContent'),
            confirmText: t('remove'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/billing/admin/payment-cards/${ card.id }/del`, {}, JSON_HEADERS);
        if (msg?.success)
        {
            messageApi.success(t('pages.adminDeposits.toasts.cardDeleted'));
            invalidate();
        }
    }

    function submit()
    {
        if (!form.cardHolderName.trim() || !form.cardNumber.trim())
        {
            messageApi.error(t('pages.adminDeposits.toasts.invalidCard'));
            return;
        }
        saveMut.mutate();
    }

    const cards = cardsQuery.data ?? [];

    return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-accent" aria-hidden />
          <h3 className="text-base font-semibold">{t('pages.adminDeposits.cardsTitle')}</h3>
        </div>
        <Button onClick={openCreate}>
          <Plus className="me-2 h-4 w-4" aria-hidden /> {t('pages.adminDeposits.addCard')}
        </Button>
      </div>

      {cards.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{t('pages.adminDeposits.noCards')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <div key={card.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{card.title || card.bankName || `#${ card.id }`}</span>
                <div className="flex items-center gap-1">
                  <Badge variant={card.status === 'active' ? 'success' : 'neutral'}>
                    {card.status === 'active' ? t('pages.adminDeposits.active') : t('pages.adminDeposits.inactive')}
                  </Badge>
                  <Tooltip content={card.status === 'active' ? t('pages.adminDeposits.inactive') : t('pages.adminDeposits.active')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="toggle status"
                      onClick={() => statusMut.mutate({ id: card.id, active: card.status !== 'active' })}
                    >
                      {card.status === 'active' ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                    </Button>
                  </Tooltip>
                  <Button variant="ghost" size="icon" aria-label={t('pages.adminDeposits.editCard')} onClick={() => openEdit(card)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t('remove')} onClick={() => onDelete(card)}>
                    <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{card.cardHolderName}</div>
              <div className="font-mono text-sm tabular-nums" dir="ltr">{card.cardNumber}</div>
              {card.bankName && <div className="text-xs text-muted-foreground">{card.bankName}</div>}
              {card.iban && <div className="font-mono text-xs text-muted-foreground" dir="ltr">{card.iban}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Card create/edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('pages.adminDeposits.editCard') : t('pages.adminDeposits.addCard')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
            <Button loading={saveMut.isPending} onClick={submit}>{t('save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-title">{t('pages.adminDeposits.cardTitle')}</Label>
            <Input id="card-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-holder">{t('pages.adminDeposits.cardHolder')}</Label>
            <Input id="card-holder" value={form.cardHolderName} onChange={(e) => setForm((f) => ({ ...f, cardHolderName: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-number">{t('pages.adminDeposits.cardNumber')}</Label>
            <Input id="card-number" dir="ltr" value={form.cardNumber} onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-bank">{t('pages.adminDeposits.bank')}</Label>
              <Input id="card-bank" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="card-order">{t('pages.adminDeposits.displayOrder')}</Label>
              <Input
                id="card-order"
                inputMode="numeric"
                value={String(form.displayOrder)}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value.replace(/[^\d]/g, '')) || 0 }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-iban">{t('pages.adminDeposits.iban')}</Label>
            <Input id="card-iban" dir="ltr" value={form.iban} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-account">{t('pages.adminDeposits.accountNumber')}</Label>
            <Input id="card-account" dir="ltr" value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
    );
}
