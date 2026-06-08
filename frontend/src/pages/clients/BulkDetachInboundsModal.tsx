import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, Button, Modal, MultiSelect } from '@/components/ui';
import { message } from '@/components/ui/message';
import type { InboundOption } from '@/hooks/useClients';
import type { BulkDetachResult } from '@/schemas/client';

const MULTI_USER_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'hysteria', 'shadowsocks']);

interface BulkDetachInboundsModalProps {
  open: boolean;
  count: number;
  inbounds: InboundOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (inboundIds: number[]) => Promise<BulkDetachResult | null>;
}

export default function BulkDetachInboundsModal({
    open,
    count,
    inbounds,
    onOpenChange,
    onSubmit
}: BulkDetachInboundsModalProps)
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
            const detached = result.detached?.length ?? 0;
            const skipped = result.skipped?.length ?? 0;
            const errors = result.errors?.length ?? 0;
            if (errors > 0)
            {
                messageApi.warning(
                    t('pages.clients.detachFromInboundsResultMixed', { detached, skipped, errors })
                );
            }
            else
            {
                messageApi.success(t('pages.clients.detachFromInboundsResult', { detached, skipped }));
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
      title={t('pages.clients.detachFromInboundsTitle', { count })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button variant="danger" disabled={targetIds.length === 0} loading={submitting} onClick={submit}>
            {t('pages.clients.detach')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('pages.clients.detachFromInboundsDesc', { count })}
      </p>
      {targetOptions.length === 0 ? (
        <Alert variant="info">{t('pages.clients.detachFromInboundsNoTargets')}</Alert>
      ) : (
        <MultiSelect
          value={targetIds.map(String)}
          onChange={(vals) => setTargetIds(vals.map(Number))}
          options={targetOptions}
          placeholder={t('pages.clients.detachFromInboundsTargets')}
        />
      )}
    </Modal>
    );
}
