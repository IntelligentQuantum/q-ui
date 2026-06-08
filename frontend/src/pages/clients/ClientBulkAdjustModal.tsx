import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, Button, Input, Label, Modal } from '@/components/ui';
import { message } from '@/components/ui/message';
import { ClientBulkAdjustFormSchema } from '@/schemas/client';

const GB = 1024 * 1024 * 1024;

interface ClientBulkAdjustModalProps {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (addDays: number, addBytes: number) => Promise<{ adjusted: number; skipped?: { email: string; reason: string }[] } | null>;
}

export default function ClientBulkAdjustModal({ open, count, onOpenChange, onSubmit }: ClientBulkAdjustModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [addDays, setAddDays] = useState<number>(0);
    const [addGB, setAddGB] = useState<number>(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() =>
    {
        if (open)
        {
            setAddDays(0);
            setAddGB(0);
        }
    }, [open]);

    async function handleOk()
    {
        const validated = ClientBulkAdjustFormSchema.safeParse({
            addDays: Math.trunc(Number(addDays) || 0),
            addGB: Number(addGB) || 0
        });
        if (!validated.success)
        {
            messageApi.warning(t(validated.error.issues[0]?.message ?? 'somethingWentWrong'));
            return;
        }
        const { addDays: days, addGB: gb } = validated.data;
        setSubmitting(true);
        try
        {
            const bytes = Math.trunc(gb * GB);
            const result = await onSubmit(days, bytes);
            if (!result)
            {
                return;
            }
            const ok = result.adjusted ?? 0;
            const skipped = result.skipped?.length ?? 0;
            if (skipped === 0)
            {
                messageApi.success(t('pages.clients.toasts.bulkAdjusted', { count: ok }));
            }
            else
            {
                const firstReason = result.skipped?.[0]?.reason ?? '';
                messageApi.warning(firstReason
                    ? `${ t('pages.clients.toasts.bulkAdjustedMixed', { ok, skipped }) } — ${ firstReason }`
                    : t('pages.clients.toasts.bulkAdjustedMixed', { ok, skipped }));
            }
            onOpenChange(false);
        }
        finally
        {
            setSubmitting(false);
        }
    }

    return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={t('pages.clients.bulkAdjustTitle', { count })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button loading={submitting} onClick={handleOk}>{t('apply')}</Button>
        </>
      }
    >
      <Alert variant="info" title={t('pages.clients.bulkAdjustHint')} className="mb-4" />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-add-days">{t('pages.clients.addDays')}</Label>
          <Input
            id="bulk-add-days"
            type="number"
            step={1}
            value={addDays}
            onChange={(e) => setAddDays(Math.trunc(Number(e.target.value) || 0))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-add-gb">{t('pages.clients.addTrafficGB')}</Label>
          <Input
            id="bulk-add-gb"
            type="number"
            step={1}
            value={addGB}
            onChange={(e) => setAddGB(Number(e.target.value) || 0)}
          />
        </div>
      </div>
    </Modal>
    );
}
