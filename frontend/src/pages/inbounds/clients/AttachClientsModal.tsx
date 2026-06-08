import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, Badge, Button, Input, Modal, MultiSelect, Table } from '@/components/ui';
import type { Column } from '@/components/ui';
import { message } from '@/components/ui/message';
import { HttpUtil } from '@/utils';
import { coerceInboundJsonField, type DBInbound } from '@/models/dbinbound';
import { isInboundMultiUser } from '../list';

interface AttachClientsModalProps {
  open: boolean;
  source: DBInbound | null;
  dbInbounds: DBInbound[];
  onClose: () => void;
  onAttached?: () => void;
}

interface BulkAttachResult {
  attached?: string[];
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

export default function AttachClientsModal({
    open,
    source,
    dbInbounds,
    onClose,
    onAttached
}: AttachClientsModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [targetIds, setTargetIds] = useState<number[]>([]);
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
        setSelectedEmails(rows.map((r) => r.email));
        setTargetIds([]);
        setSearch('');
    }, [open, source]);

    const targetOptions = useMemo(() =>
    {
        if (!source)
        {
            return [];
        }
        return (dbInbounds || [])
            .filter((ib) => ib.id !== source.id && isInboundMultiUser(ib))
            .map((ib) => ({ value: String(ib.id), label: ib.remark?.trim() || ib.tag || '' }));
    }, [dbInbounds, source]);

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
            { key: 'email', header: t('pages.inbounds.email'), cell: (r) => <span className="truncate">{r.email}</span> },
            { key: 'comment', header: t('comment'), cell: (r) => <span className="truncate text-muted-foreground">{r.comment}</span> },
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
        if (!source || targetIds.length === 0 || selectedEmails.length === 0)
        {
            return;
        }
        setSaving(true);
        try
        {
            const msg = await HttpUtil.post(
                '/panel/api/clients/bulkAttach',
                { emails: selectedEmails, inboundIds: targetIds },
                { headers: { 'Content-Type': 'application/json' } }
            );
            if (!msg?.success)
            {
                messageApi.error(msg?.msg || t('somethingWentWrong'));
                return;
            }
            const result = (msg.obj || {}) as BulkAttachResult;
            const attached = result.attached?.length ?? 0;
            const skipped = result.skipped?.length ?? 0;
            const errors = result.errors?.length ?? 0;
            if (errors > 0)
            {
                messageApi.warning(t('pages.inbounds.attachClientsResultMixed', { attached, skipped, errors }));
            }
            else
            {
                messageApi.success(t('pages.inbounds.attachClientsResult', { attached, skipped }));
            }
            onAttached?.();
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
      title={t('pages.inbounds.attachClientsTitle', { remark: source?.remark?.trim() || source?.tag || '' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button
            disabled={targetIds.length === 0 || selectedEmails.length === 0}
            loading={saving}
            onClick={submit}
          >
            {t('pages.inbounds.attachClients')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('pages.inbounds.attachClientsDesc', { count: clientRows.length })}
      </p>

      <div className="mb-3 flex flex-col gap-2">
        <p className="text-sm font-medium">{t('pages.inbounds.attachClientsSelectLabel')}</p>
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

      {targetOptions.length === 0 ? (
        <Alert variant="info">{t('pages.inbounds.attachClientsNoTargets')}</Alert>
      ) : (
        <MultiSelect
          value={targetIds.map(String)}
          onChange={(vals) => setTargetIds(vals.map(Number))}
          options={targetOptions}
          placeholder={t('pages.inbounds.attachClientsTargets')}
        />
      )}
    </Modal>
    );
}
