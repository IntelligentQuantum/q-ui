import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { HttpUtil, ClipboardManager } from '@/utils';
import { getMessage } from '@/utils/messageBus';
import { Alert, Badge, Button, Table, Tooltip, confirm } from '@/components/ui';
import type { Column } from '@/components/ui';
import CustomGeoFormModal from './CustomGeoFormModal';
import type { CustomGeoRecord } from './CustomGeoFormModal';

interface CustomGeoSectionProps {
  active: boolean;
}

interface CustomGeoListRecord extends CustomGeoRecord {
  lastUpdatedAt?: number;
}

function formatTime(ts?: number): string
{
    if (!ts)
    {
        return '';
    }
    const d = new Date(ts * 1000);
    if (isNaN(d.getTime()))
    {
        return String(ts);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${ d.getFullYear() }-${ pad(d.getMonth() + 1) }-${ pad(d.getDate()) } ${ pad(d.getHours()) }:${ pad(d.getMinutes()) }`;
}

function relativeTime(ts?: number): string
{
    if (!ts)
    {
        return '';
    }
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60)
    {
        return 'just now';
    }
    if (diff < 3600)
    {
        return `${ Math.floor(diff / 60) } min ago`;
    }
    if (diff < 86400)
    {
        return `${ Math.floor(diff / 3600) } h ago`;
    }
    if (diff < 2592000)
    {
        return `${ Math.floor(diff / 86400) } d ago`;
    }
    return formatTime(ts);
}

function extDisplay(record: CustomGeoListRecord): string
{
    const fn = record.type === 'geoip'
        ? `geoip_${ record.alias }.dat`
        : `geosite_${ record.alias }.dat`;
    return `ext:${ fn }:tag`;
}

export default function CustomGeoSection({ active }: CustomGeoSectionProps)
{
    const { t } = useTranslation();
    const [list, setList] = useState<CustomGeoListRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingAll, setUpdatingAll] = useState(false);
    const [actionId, setActionId] = useState<number | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<CustomGeoListRecord | null>(null);

    const loadList = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.get('/panel/api/custom-geo/list');
            if (msg?.success && Array.isArray(msg.obj))
            {
                setList(msg.obj);
            }
        }
        finally
        {
            setLoading(false);
        }
    }, []);

    useEffect(() =>
    {
        if (active)
        {
            loadList();
        }
    }, [active, loadList]);

    function openAdd()
    {
        setEditingRecord(null);
        setFormOpen(true);
    }

    function openEdit(record: CustomGeoListRecord)
    {
        setEditingRecord(record);
        setFormOpen(true);
    }

    async function copyExt(record: CustomGeoListRecord)
    {
        const text = extDisplay(record);
        const ok = await ClipboardManager.copyText(text);
        if (ok)
        {
            getMessage().success(`${ t('copied') }: ${ text }`);
        }
    }

    async function confirmDelete(record: CustomGeoListRecord)
    {
        const ok = await confirm({
            title: t('pages.index.customGeoDelete'),
            description: t('pages.index.customGeoDeleteConfirm'),
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (!ok)
        {
            return;
        }
        const msg = await HttpUtil.post(`/panel/api/custom-geo/delete/${ record.id }`);
        if (msg?.success)
        {
            await loadList();
        }
    }

    async function downloadOne(id: number)
    {
        setActionId(id);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/custom-geo/download/${ id }`);
            if (msg?.success)
            {
                await loadList();
            }
        }
        finally
        {
            setActionId(null);
        }
    }

    async function updateAll()
    {
        setUpdatingAll(true);
        try
        {
            const msg = await HttpUtil.post<{ succeeded?: unknown[]; failed?: unknown[] }>('/panel/api/custom-geo/update-all');
            const ok = msg?.obj?.succeeded?.length || 0;
            const failed = msg?.obj?.failed?.length || 0;
            if (msg?.success || ok > 0)
            {
                await loadList();
                if (failed > 0)
                {
                    getMessage().warning(`Updated ${ ok }, failed ${ failed }`);
                }
            }
        }
        finally
        {
            setUpdatingAll(false);
        }
    }

    const columns = useMemo<Column<CustomGeoListRecord>[]>(
        () => [
            {
                key: 'alias',
                header: t('pages.index.customGeoAlias'),
                width: 200,
                cell: (record) => (
          <div className="flex items-center gap-1.5">
            <Badge variant={record.type === 'geoip' ? 'primary' : 'neutral'}>{record.type}</Badge>
            <span className="break-all font-medium">{record.alias}</span>
          </div>
                )
            },
            {
                key: 'url',
                header: t('pages.index.customGeoUrl'),
                cell: (record) => (
          <Tooltip content={record.url}>
            <a
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[280px] truncate break-all text-accent hover:underline"
            >
              {record.url}
            </a>
          </Tooltip>
                )
            },
            {
                key: 'extDat',
                header: t('pages.index.customGeoExtColumn'),
                width: 220,
                cell: (record) => (
          <Tooltip content={t('copy')}>
            <code
              onClick={() => copyExt(record)}
              className="cursor-pointer select-all rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-foreground/[0.06]"
            >
              {extDisplay(record)}
            </code>
          </Tooltip>
                )
            },
            {
                key: 'lastUpdatedAt',
                header: t('pages.index.customGeoLastUpdated'),
                width: 140,
                cell: (record) =>
                    record.lastUpdatedAt ? (
            <Tooltip content={formatTime(record.lastUpdatedAt)}>
              <span>{relativeTime(record.lastUpdatedAt)}</span>
            </Tooltip>
                    ) : (
            <span className="opacity-50">—</span>
                    )
            },
            {
                key: 'action',
                header: t('pages.index.customGeoActions'),
                width: 120,
                cell: (record) => (
          <div className="flex items-center gap-1">
            <Tooltip content={t('pages.index.customGeoEdit')}>
              <Button
                aria-label={t('pages.index.customGeoEdit')}
                variant="ghost"
                size="icon"
                onClick={() => openEdit(record)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip content={t('pages.index.customGeoDownload')}>
              <Button
                aria-label={t('pages.index.customGeoDownload')}
                variant="ghost"
                size="icon"
                loading={actionId === record.id}
                onClick={() => downloadOne(record.id)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip content={t('pages.index.customGeoDelete')}>
              <Button
                aria-label={t('pages.index.customGeoDelete')}
                variant="ghost"
                size="icon"
                onClick={() => confirmDelete(record)}
                className="text-danger hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </Tooltip>
          </div>
                )
            }
        ],
        [t, actionId]
    );

    const emptyState = (
    <div className="flex flex-col items-center gap-1.5 py-5 opacity-60">
      <Inbox className="h-8 w-8" aria-hidden />
      <div>{t('pages.index.customGeoEmpty')}</div>
    </div>
    );

    return (
    <div className="flex flex-col gap-3">
      <Alert variant="info" title={t('pages.index.customGeoRoutingHint')} />

      <div className="flex flex-wrap items-center gap-2">
        <Button loading={loading} onClick={openAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('pages.index.customGeoAdd')}
        </Button>
        <Button
          variant="secondary"
          loading={updatingAll}
          disabled={list.length === 0}
          onClick={updateAll}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t('pages.index.geofilesUpdateAll')}
        </Button>
        {list.length > 0 && (
          <span className="ms-1 rounded-full bg-surface-sunken px-2 py-0.5 text-xs opacity-75">{list.length}</span>
        )}
      </div>

      <Table
        columns={columns}
        data={list}
        rowKey={(r) => String(r.id)}
        loading={loading}
        pageSize={0}
        empty={emptyState}
      />

      <CustomGeoFormModal
        open={formOpen}
        record={editingRecord}
        onClose={() => setFormOpen(false)}
        onSaved={loadList}
      />
    </div>
    );
}
