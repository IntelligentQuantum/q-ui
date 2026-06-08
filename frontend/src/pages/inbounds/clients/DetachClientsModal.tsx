import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input, Modal, Table } from '@/components/ui';
import type { Column } from '@/components/ui';
import { message } from '@/components/ui/message';
import { HttpUtil } from '@/utils';
import { coerceInboundJsonField, type DBInbound } from '@/models/dbinbound';

interface DetachClientsModalProps {
  open: boolean;
  source: DBInbound | null;
  onClose: () => void;
  onDetached?: () => void;
}

interface BulkDetachResult {
  detached?: string[];
  skipped?: string[];
  errors?: string[];
}

interface ClientRow {
  email: string;
  comment: string;
  enable: boolean;
}

function readClientRows(settings: unknown): ClientRow[]
{
    const parsed = coerceInboundJsonField(settings) as {
    clients?: Array<{ email?: string; comment?: string; enable?: boolean }>;
  };
    const clients = Array.isArray(parsed?.clients) ? parsed.clients : [];
    return clients
        .map((c) => ({
            email: (c?.email || '').trim(),
            comment: (c?.comment || '').trim(),
            enable: c?.enable !== false
        }))
        .filter((r) => r.email);
}

export default function DetachClientsModal({
    open,
    source,
    onClose,
    onDetached
}: DetachClientsModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [saving, setSaving] = useState(false);
    const [clientRows, setClientRows] = useState<ClientRow[]>([]);
    const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const rows = source ? readClientRows(source.settings) : [];
        setClientRows(rows);
        setSelectedEmails([]);
        setSearch('');
    }, [open, source]);

    const filteredRows = useMemo(() =>
    {
        const q = search.trim().toLowerCase();
        if (!q)
        {
            return clientRows;
        }
        return clientRows.filter(
            (r) => r.email.toLowerCase().includes(q) || r.comment.toLowerCase().includes(q)
        );
    }, [clientRows, search]);

    const columns: Column<ClientRow>[] = useMemo(
        () => [
            {
                key: 'email',
                header: t('pages.inbounds.email'),
                cell: (r) => <span className="truncate">{r.email}</span>
            },
            {
                key: 'comment',
                header: t('comment'),
                cell: (r) => <span className="truncate text-muted-foreground">{r.comment}</span>
            },
            {
                key: 'enable',
                header: t('enable'),
                width: 90,
                cell: (r) =>
                    r.enable ? (
            <Badge variant="success">{t('enable')}</Badge>
                    ) : (
            <Badge variant="neutral">{t('pages.inbounds.attachClientsStatusDisabled')}</Badge>
                    )
            }
        ],
        [t]
    );

    async function submit()
    {
        if (!source || selectedEmails.length === 0)
        {
            return;
        }
        setSaving(true);
        try
        {
            const msg = await HttpUtil.post(
                '/panel/api/clients/bulkDetach',
                { emails: selectedEmails, inboundIds: [source.id] },
                { headers: { 'Content-Type': 'application/json' } }
            );
            if (!msg?.success)
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
                return;
            }
            const result = (msg.obj || {}) as BulkDetachResult;
            const detached = result.detached?.length ?? 0;
            const skipped = result.skipped?.length ?? 0;
            const errors = result.errors?.length ?? 0;
            if (errors > 0)
            {
                messageApi.warning(t('pages.inbounds.detachClientsResultMixed', { detached, skipped, errors }));
            }
            else
            {
                messageApi.success(t('pages.inbounds.detachClientsResult', { detached, skipped }));
            }
            onDetached?.();
            onClose();
        }
        finally
        {
            setSaving(false);
        }
    }

    return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('pages.inbounds.detachClientsTitle', { remark: source?.tag ?? '' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="danger" disabled={selectedEmails.length === 0} loading={saving} onClick={submit}>
            {t('pages.inbounds.detachClients')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('pages.inbounds.detachClientsDesc', { count: clientRows.length })}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('pages.inbounds.detachClientsSelectLabel')}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('pages.inbounds.attachClientsSearchPlaceholder')}
            className="max-w-xs"
          />
          <span className="text-sm text-muted-foreground">
            {t('pages.inbounds.attachClientsSelectedCount', {
                selected: selectedEmails.length,
                total: clientRows.length
            })}
          </span>
        </div>
        <Table<ClientRow>
          columns={columns}
          data={filteredRows}
          rowKey={(r) => r.email}
          pageSize={0}
          rowSelection={{ selectedKeys: selectedEmails, onChange: setSelectedEmails }}
        />
      </div>
    </Modal>
    );
}
