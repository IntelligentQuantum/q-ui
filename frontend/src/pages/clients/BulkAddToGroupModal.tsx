import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Label, Modal } from '@/components/ui';
import { message } from '@/components/ui/message';

interface BulkAddToGroupModalProps {
  open: boolean;
  count: number;
  groups: string[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (group: string) => Promise<{ affected?: number } | null>;
}

export default function BulkAddToGroupModal({
    open,
    count,
    groups,
    onOpenChange,
    onSubmit
}: BulkAddToGroupModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [value, setValue] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() =>
    {
        if (open)
        {
            setValue('');
        }
    }, [open]);

    async function submit()
    {
        const next = value.trim();
        if (!next)
        {
            return;
        }
        setSubmitting(true);
        try
        {
            const result = await onSubmit(next);
            if (result)
            {
                const affected = result.affected ?? 0;
                messageApi.success(t('pages.clients.addToGroupSuccessToast', { count: affected, group: next }));
                onOpenChange(false);
            }
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
      title={t('pages.clients.addToGroupTitle', { count })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={!value.trim()} loading={submitting} onClick={submit}>{t('add')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bulk-group-name">{t('pages.clients.group')}</Label>
        <p className="-mt-0.5 text-xs text-muted-foreground">{t('pages.clients.addToGroupTooltip')}</p>
        <Input
          id="bulk-group-name"
          list="bulk-group-suggestions"
          value={value}
          placeholder={t('pages.clients.groupName')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) =>
          {
              if (e.key === 'Enter')
              {
                  e.preventDefault();
                  submit();
              }
          }}
          autoFocus
        />
        <datalist id="bulk-group-suggestions">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
    </Modal>
    );
}
