import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Menu, Upload, Download, RefreshCw, Info, Trash2, X, Inbox } from 'lucide-react';

import { HttpUtil } from '@/utils';
import {
    Button,
    Card,
    Checkbox,
    DropdownMenu,
    Switch,
    Table,
    Tooltip,
    Badge,
    type DropdownItem,
    type Column
} from '@/components/ui';

import { buildRowActionsItems } from './RowActions';
import { useInboundColumns } from './useInboundColumns';
import InboundStatsModal from './InboundStatsModal';
import type { DBInboundRecord, GeneralAction, InboundListProps, RowAction } from './types';

export default function InboundList({
    dbInbounds,
    clientCount,
    lastOnlineMap: _lastOnlineMap,
    inboundSpeed,
    expireDiff,
    trafficDiff,
    pageSize,
    isMobile,
    subEnable,
    nodesById,
    hasActiveNode,
    onAddInbound,
    onGeneralAction,
    onRowAction,
    onBulkDelete
}: InboundListProps)
{
    const { t } = useTranslation();
    const [statsRecord, setStatsRecord] = useState<DBInboundRecord | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

    const onSwitchEnable = useCallback(async (dbInbound: DBInboundRecord, next: boolean) =>
    {
        const previous = dbInbound.enable;
        dbInbound.enable = next;
        try
        {
            const formData = new FormData();
            formData.append('enable', String(next));
            const msg = await HttpUtil.post(`/panel/api/inbounds/setEnable/${ dbInbound.id }`, formData);
            if (!msg?.success)
            {
                dbInbound.enable = previous;
            }
        }
        catch
        {
            dbInbound.enable = previous;
        }
    }, []);

    const hasAnyRemark = useMemo(
        () => dbInbounds.some((i) => typeof i.remark === 'string' && i.remark.trim() !== ''),
        [dbInbounds]
    );

    const toggleSelect = useCallback((id: number, checked: boolean) =>
    {
        setSelectedRowKeys((prev) =>
        {
            const next = new Set(prev);
            if (checked)
            {
                next.add(id);
            }
            else
            {
                next.delete(id);
            }
            return Array.from(next);
        });
    }, []);

    const selectAll = useCallback((checked: boolean) =>
    {
        setSelectedRowKeys(checked ? dbInbounds.map((i) => i.id) : []);
    }, [dbInbounds]);

    const allSelected = dbInbounds.length > 0 && selectedRowKeys.length === dbInbounds.length;

    const handleBulkDelete = useCallback(async () =>
    {
        const ok = await onBulkDelete(selectedRowKeys);
        if (ok)
        {
            setSelectedRowKeys([]);
        }
    }, [onBulkDelete, selectedRowKeys]);

    const baseColumns = useInboundColumns({
        hasAnyRemark,
        hasActiveNode,
        nodesById,
        clientCount,
        inboundSpeed,
        subEnable,
        expireDiff,
        trafficDiff,
        onRowAction,
        onSwitchEnable
    });

    // Leading selection column (our Table has no built-in row selection).
    const selectColumn: Column<DBInboundRecord> = {
        key: '__select',
        width: 40,
        align: 'center',
        header: (
      <Checkbox
        checked={allSelected}
        onChange={(e) => selectAll(e.target.checked)}
        aria-label={t('pages.inbounds.selectAll')}
      />
        ),
        cell: (record) => (
      <Checkbox
        checked={selectedRowKeys.includes(record.id)}
        onChange={(e) => toggleSelect(record.id, e.target.checked)}
        aria-label={`#${ record.id }`}
      />
        )
    };

    const columns: Column<DBInboundRecord>[] = [selectColumn, ...baseColumns];

    const tablePageSize = pageSize > 0 ? pageSize : 0;

    const generalActionItems: DropdownItem[] = [
        { key: 'import', icon: <Upload className="h-4 w-4" />, label: t('pages.inbounds.importInbound'), onSelect: () => onGeneralAction('import') },
        { key: 'export', icon: <Download className="h-4 w-4" />, label: t('pages.inbounds.export'), onSelect: () => onGeneralAction('export') },
        ...(subEnable
            ? [{ key: 'subs', icon: <Download className="h-4 w-4" />, label: `${ t('pages.inbounds.export') } — ${ t('pages.settings.subSettings') }`, onSelect: () => onGeneralAction('subs' as GeneralAction) } as DropdownItem]
            : []),
        { key: 'resetInbounds', icon: <RefreshCw className="h-4 w-4" />, label: t('pages.inbounds.resetAllTraffic'), onSelect: () => onGeneralAction('resetInbounds') }
    ];

    const empty = (
    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-50" aria-hidden />
      <span>{t('noData')}</span>
    </div>
    );

    return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
        <Button variant="primary" onClick={onAddInbound}>
          <Plus className="h-4 w-4" aria-hidden />
          {!isMobile && t('pages.inbounds.addInbound')}
        </Button>
        <DropdownMenu
          align="start"
          label={t('pages.inbounds.generalActions')}
          items={generalActionItems}
          trigger={(
            <span className="inline-flex items-center gap-2">
              <Menu className="h-4 w-4" aria-hidden />
              {!isMobile && t('pages.inbounds.generalActions')}
            </span>
          )}
        />
        {selectedRowKeys.length > 0 && (
          <>
            <Badge variant="primary" className="gap-1.5">
              {t('pages.inbounds.selectedCount', { count: selectedRowKeys.length })}
              <button
                type="button"
                onClick={() => setSelectedRowKeys([])}
                aria-label={t('cancel')}
                className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-accent/20"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
            <Button variant="danger" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {!isMobile && t('delete')}
            </Button>
          </>
        )}
      </div>

      {/* Body */}
      {isMobile ? (
        <div className="flex flex-col gap-3 p-3">
          {dbInbounds.length === 0 ? (
              empty
          ) : (
            <>
              <div className="flex items-center gap-2 px-1 pb-1">
                <Checkbox checked={allSelected} onChange={(e) => selectAll(e.target.checked)}>
                  {t('pages.inbounds.selectAll')}
                </Checkbox>
                {selectedRowKeys.length > 0 && (
                  <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent">
                    {selectedRowKeys.length}
                  </span>
                )}
              </div>
              {dbInbounds.map((record) =>
              {
                  const selected = selectedRowKeys.includes(record.id);
                  return (
                  <div
                    key={record.id}
                    className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${ selected ? 'border-accent bg-accent-subtle/40' : 'border-border bg-surface-sunken' }`}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selected}
                        onChange={(e) => toggleSelect(record.id, e.target.checked)}
                      />
                      <span className="text-[11px] text-muted-foreground">#{record.id}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{record.remark}</span>
                      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Tooltip content={t('pages.inbounds.inboundInfo')}>
                          <button
                            type="button"
                            aria-label={t('pages.inbounds.inboundInfo')}
                            onClick={() => setStatsRecord(record)}
                            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                          >
                            <Info className="h-4 w-4" aria-hidden />
                          </button>
                        </Tooltip>
                        <Switch
                          checked={record.enable}
                          onCheckedChange={(next) => onSwitchEnable(record, next)}
                          aria-label={t('pages.inbounds.enable')}
                        />
                        <DropdownMenu
                          align="end"
                          label={t('more')}
                          items={buildRowActionsItems({
                              record,
                              subEnable,
                              t,
                              isMobile: true,
                              hasClients: (clientCount[record.id]?.clients || 0) > 0,
                              onClick: (key: RowAction) => onRowAction({ key, dbInbound: record })
                          })}
                        />
                      </div>
                    </div>
                  </div>
                  );
              })}
            </>
          )}
        </div>
      ) : (
        <Table
          columns={columns}
          data={dbInbounds}
          rowKey={(r) => String(r.id)}
          pageSize={tablePageSize}
          empty={empty}
          className="rounded-none border-0"
        />
      )}

      <InboundStatsModal
        open={isMobile && !!statsRecord}
        record={statsRecord}
        hasActiveNode={hasActiveNode}
        nodesById={nodesById}
        clientCount={clientCount}
        trafficDiff={trafficDiff}
        expireDiff={expireDiff}
        onClose={() => setStatsRecord(null)}
      />
    </Card>
    );
}
