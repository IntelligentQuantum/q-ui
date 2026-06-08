import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, Button, Modal, MultiSelect } from '@/components/ui';
import { message } from '@/components/ui/message';
import type { InboundOption } from '@/hooks/useClients';
import type { BulkAttachResult } from '@/schemas/client';

const MULTI_USER_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'hysteria', 'shadowsocks']);

interface BulkAttachInboundsModalProps {
  open: boolean;
  count: number;
  inbounds: InboundOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (inboundIds: number[]) => Promise<BulkAttachResult | null>;
}

export default function BulkAttachInboundsModal({
    open,
    count,
    inbounds,
    onOpenChange,
    onSubmit
}: BulkAttachInboundsModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [targetIds, setTargetIds] = useState<number[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() =>
    {
        if (open)
        {
            setTargetIds([]);
        }
    }, [open]);

    const targetOptions = useMemo(() =>
    {
        return (inbounds || [])
            .filter((ib) => MULTI_USER_PROTOCOLS.has((ib.protocol || '').toLowerCase()))
            .map((ib) => ({
                value: String(ib.id),
                label: ib.remark?.trim() || ib.tag || ''
            }));
    }, [inbounds]);

    async function submit()
    {
        if (targetIds.length === 0 || count === 0)
        {
            return;
        }
        setSubmitting(true);
        try
        {
            const result = await onSubmit(targetIds);
            if (!result)
            {
                return;
            }
            const attached = result.attached?.length ?? 0;
            const skipped = result.skipped?.length ?? 0;
            const errors = result.errors?.length ?? 0;
            if (errors > 0)
            {
                messageApi.warning(
                    t('pages.inbounds.attachClientsResultMixed', { attached, skipped, errors })
                );
            }
            else
            {
                messageApi.success(t('pages.inbounds.attachClientsResult', { attached, skipped }));
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
      title={t('pages.clients.attachToInboundsTitle', { count })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={targetIds.length === 0} loading={submitting} onClick={submit}>
            {t('pages.inbounds.attachClients')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('pages.clients.attachToInboundsDesc', { count })}
      </p>
      {targetOptions.length === 0 ? (
        <Alert variant="info">{t('pages.clients.attachToInboundsNoTargets')}</Alert>
      ) : (
        <MultiSelect
          value={targetIds.map(String)}
          onChange={(vals) => setTargetIds(vals.map(Number))}
          options={targetOptions}
          placeholder={t('pages.clients.attachToInboundsTargets')}
        />
      )}
    </Modal>
    );
}
