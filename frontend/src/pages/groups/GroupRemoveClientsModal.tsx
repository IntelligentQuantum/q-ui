import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input, Modal, Table } from '@/components/ui';
import type { Column } from '@/components/ui';
import { message } from '@/components/ui/message';
import type { ClientRecord } from '@/hooks/useClients';

interface GroupRemoveClientsModalProps {
  open: boolean;
  groupName: string | null;
  members: ClientRecord[];
  onClose: () => void;
  onSubmit: (emails: string[]) => Promise<{ affected?: number } | null>;
}

interface ClientRow {
  email: string;
  comment: string;
  enable: boolean;
}

export default function GroupRemoveClientsModal({
    open,
    groupName,
    members,
    onClose,
    onSubmit
}: GroupRemoveClientsModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [saving, setSaving] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
    const [search, setSearch] = useState('');

    const rows = useMemo<ClientRow[]>(
        () =>
            (members || [])
                .map((c) => ({
                    email: (c.email || '').trim(),
                    comment: (c.comment || '').trim(),
                    enable: c.enable !== false
                }))
                .filter((r) => r.email),
        [members]
    );

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        setSelectedEmails([]);
        setSearch('');
    }, [open, rows]);

    const filteredRows = useMemo(() =>
    {
        const q = search.trim().toLowerCase();
        if (!q)
        {
            return rows;
        }
        return rows.filter(
            (r) => r.email.toLowerCase().includes(q) || r.comment.toLowerCase().includes(q)
        );
    }, [rows, search]);

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
        if (!groupName || selectedEmails.length === 0)
        {
            return;
        }
        setSaving(true);
        try
        {
            const result = await onSubmit(selectedEmails);
            if (!result)
            {
                return;
            }
            const affected = result.affected ?? selectedEmails.length;
            messageApi.success(
                t('pages.groups.removeFromGroupResult', { count: affected, name: groupName })
            );
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
      title={t('pages.groups.removeFromGroupTitle', { name: groupName ?? '' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="danger" disabled={selectedEmails.length === 0} loading={saving} onClick={submit}>
            {t('remove')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{t('pages.groups.removeFromGroupDesc')}</p>

      <div className="flex flex-col gap-2">
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
                total: rows.length
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
