import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, Badge, Button, Input, Modal, Select, Spinner, Table } from '@/components/ui';
import type { Column } from '@/components/ui';
import { message } from '@/components/ui/message';
import { HttpUtil } from '@/utils';
import type { DBInbound } from '@/models/dbinbound';

interface AttachExistingClientsModalProps {
  open: boolean;
  target: DBInbound | null;
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
  group: string;
  enable: boolean;
  alreadyAttached: boolean;
}

interface RawClient {
  email?: string;
  group?: string;
  enable?: boolean;
  inboundIds?: number[] | null;
}

export default function AttachExistingClientsModal({
    open,
    target,
    onClose,
    onAttached
}: AttachExistingClientsModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [clientRows, setClientRows] = useState<ClientRow[]>([]);
    const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState<string | undefined>(undefined);

    useEffect(() =>
    {
        if (!open || !target)
        {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setSearch('');
        setGroupFilter(undefined);
        HttpUtil.get('/panel/api/clients/list', undefined, { silent: true })
            .then((msg) =>
            {
                if (cancelled)
                {
                    return;
                }
                const list = Array.isArray(msg?.obj) ? (msg.obj as RawClient[]) : [];
                const rows: ClientRow[] = list
                    .map((c) => ({
                        email: (c?.email || '').trim(),
                        group: (c?.group || '').trim(),
                        enable: c?.enable !== false,
                        alreadyAttached: Array.isArray(c?.inboundIds) && c.inboundIds.includes(target.id)
                    }))
                    .filter((r) => r.email);
                setClientRows(rows);
                setSelectedEmails(rows.filter((r) => !r.alreadyAttached).map((r) => r.email));
            })
            .finally(() =>
            {
                if (!cancelled)
                {
                    setLoading(false);
                }
            });
        return () =>
        {
            cancelled = true;
        };
    }, [open, target]);

    const groupOptions = useMemo(() =>
    {
        const set = new Set<string>();
        for (const r of clientRows)
        {
            if (r.group)
            {
                set.add(r.group);
            }
        }
        return [...set].sort((a, b) => a.localeCompare(b)).map((g) => ({ value: g, label: g }));
    }, [clientRows]);

    const attachableCount = useMemo(
        () => clientRows.filter((r) => !r.alreadyAttached).length,
        [clientRows]
    );

    const filteredRows = useMemo(() =>
    {
        const q = search.trim().toLowerCase();
        return clientRows.filter((r) =>
        {
            if (groupFilter && r.group !== groupFilter)
            {
                return false;
            }
            if (!q)
            {
                return true;
            }
            return r.email.toLowerCase().includes(q) || r.group.toLowerCase().includes(q);
        });
    }, [clientRows, search, groupFilter]);

    const columns: Column<ClientRow>[] = useMemo(
        () => [
            { key: 'email', header: t('pages.inbounds.email'), cell: (r) => <span className="truncate">{r.email}</span> },
            {
                key: 'group',
                header: t('pages.clients.group'),
                width: 150,
                cell: (r) => (r.group ? <Badge variant="primary">{r.group}</Badge> : <span className="text-muted-foreground">—</span>)
            },
            {
                key: 'status',
                header: t('enable'),
                width: 140,
                cell: (r) =>
                {
                    if (r.alreadyAttached)
                    {
                        return <Badge variant="neutral">{t('pages.inbounds.attachExistingStatusAttached')}</Badge>;
                    }
                    return r.enable ? (
            <Badge variant="success">{t('enable')}</Badge>
                    ) : (
            <Badge variant="neutral">{t('pages.inbounds.attachClientsStatusDisabled')}</Badge>
                    );
                }
            }
        ],
        [t]
    );

    async function submit()
    {
        if (!target || selectedEmails.length === 0)
        {
            return;
        }
        setSaving(true);
        try
        {
            const msg = await HttpUtil.post(
                '/panel/api/clients/bulkAttach',
                { emails: selectedEmails, inboundIds: [target.id] },
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

    const noClients = !loading && clientRows.length === 0;

    return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('pages.inbounds.attachExistingTitle', { remark: target?.remark?.trim() || target?.tag || '' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={selectedEmails.length === 0} loading={saving} onClick={submit}>
            {t('pages.inbounds.attachClients')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t('pages.inbounds.attachExistingDesc', { count: attachableCount })}
      </p>

      {noClients ? (
        <Alert variant="info">{t('pages.inbounds.attachExistingNoClients')}</Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('pages.inbounds.attachClientsSearchPlaceholder')}
                className="w-60"
              />
              {groupOptions.length > 0 && (
                <Select
                  value={groupFilter ?? ''}
                  onChange={(v) => setGroupFilter(v || undefined)}
                  options={[{ value: '', label: t('pages.clients.group') }, ...groupOptions]}
                  className="min-w-40"
                />
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {t('pages.inbounds.attachClientsSelectedCount', {
                  selected: selectedEmails.length,
                  total: attachableCount
              })}
            </span>
          </div>
          {loading ? (
            <div className="grid min-h-[200px] place-items-center">
              <Spinner className="h-7 w-7 text-muted-foreground" />
            </div>
          ) : (
            <Table<ClientRow>
              columns={columns}
              data={filteredRows}
              rowKey={(r) => r.email}
              pageSize={0}
              rowSelection={{
                  selectedKeys: selectedEmails,
                  onChange: setSelectedEmails,
                  getDisabled: (r) => r.alreadyAttached
              }}
            />
          )}
        </div>
      )}
    </Modal>
    );
}
