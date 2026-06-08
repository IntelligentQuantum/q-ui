import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw } from 'lucide-react';

import { HttpUtil, FileManager, IntlUtil, PromiseUtil } from '@/utils';
import { useDatepicker } from '@/hooks/useDatepicker';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Badge, Button, Checkbox, Input, Modal, Select, cn } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface XrayLogModalProps {
  open: boolean;
  onClose: () => void;
}

interface XrayLogEntry {
  DateTime?: string | number;
  FromAddress?: string;
  ToAddress?: string;
  Inbound?: string;
  Outbound?: string;
  Email?: string;
  Event?: number;
}

const EVENT_LABELS: Record<number, string> = { 0: 'DIRECT', 1: 'BLOCKED', 2: 'PROXY' };
const EVENT_BADGE: Record<number, BadgeVariant> = { 0: 'success', 1: 'danger', 2: 'primary' };
// Row text color per event (replaces .log-row-1 / .log-row-2 CSS).
const ROW_COLOR: Record<number, string> = { 1: 'text-danger', 2: 'text-accent' };

function eventLabel(ev?: number): string
{
    return EVENT_LABELS[ev ?? -1] ?? String(ev ?? '');
}

function eventBadge(ev?: number): BadgeVariant
{
    return EVENT_BADGE[ev ?? -1] ?? 'neutral';
}

function shortTime(value?: string | number): string
{
    if (!value)
    {
        return '';
    }
    const d = new Date(value);
    if (isNaN(d.getTime()))
    {
        return '';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${ hh }:${ mm }:${ ss }`;
}

export default function XrayLogModal({ open, onClose }: XrayLogModalProps)
{
    const { t } = useTranslation();
    const { datepicker } = useDatepicker();
    const { isMobile } = useMediaQuery();
    const [rows, setRows] = useState('20');
    const [filter, setFilter] = useState('');
    const [showDirect, setShowDirect] = useState(true);
    const [showBlocked, setShowBlocked] = useState(true);
    const [showProxy, setShowProxy] = useState(true);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<XrayLogEntry[]>([]);
    const openRef = useRef(open);

    const orderedLogs = useMemo(() => [...logs].reverse(), [logs]);

    const refresh = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<XrayLogEntry[]>(`/panel/api/server/xraylogs/${ rows }`, {
                filter,
                showDirect,
                showBlocked,
                showProxy
            });
            if (msg?.success)
            {
                setLogs(msg.obj || []);
            }
            await PromiseUtil.sleep(300);
        }
        finally
        {
            setLoading(false);
        }
    }, [rows, filter, showDirect, showBlocked, showProxy]);

    useEffect(() =>
    {
        openRef.current = open;
        if (open)
        {
            refresh();
        }
    }, [open, refresh]);

    useEffect(() =>
    {
        if (openRef.current)
        {
            refresh();
        }
    }, [rows, showDirect, showBlocked, showProxy, refresh]);

    function fullDate(value?: string | number): string
    {
        return IntlUtil.formatDate(value, datepicker);
    }

    function download()
    {
        if (!Array.isArray(logs) || logs.length === 0)
        {
            FileManager.downloadTextFile('', 'q-ui.log');
            return;
        }
        const lines = logs.map((l) =>
        {
            try
            {
                const dt = l.DateTime ? new Date(l.DateTime) : null;
                const dateStr = dt && !isNaN(dt.getTime()) ? dt.toISOString() : '';
                const eventText = eventLabel(l.Event);
                const emailPart = l.Email ? ` Email=${ l.Email }` : '';
                return `${ dateStr } FROM=${ l.FromAddress || '' } TO=${ l.ToAddress || '' } INBOUND=${ l.Inbound || '' } OUTBOUND=${ l.Outbound || '' }${ emailPart } EVENT=${ eventText }`.trim();
            }
            catch
            {
                return JSON.stringify(l);
            }
        }).join('\n');
        FileManager.downloadTextFile(lines, 'q-ui.log');
    }

    const titleNode = (
    <span className="inline-flex items-center gap-2">
      {t('pages.index.logs')}
      <button
        type="button"
        onClick={refresh}
        aria-label={t('refresh') || 'Refresh'}
        className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
      </button>
    </span>
    );

    return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleNode}
      size="xl"
      className={isMobile ? 'h-full max-w-none rounded-none' : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={rows}
          onChange={setRows}
          className="w-[72px]"
          options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
              { value: '500', label: '500' }
          ]}
        />
        <div className="flex min-w-[160px] flex-1 items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filter')}</span>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyUp={(e) =>
            {
                if (e.key === 'Enter')
                {
                    refresh();
                }
            }}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={showDirect} onChange={(e) => setShowDirect(e.target.checked)}>
            Direct
          </Checkbox>
          <Checkbox checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)}>
            Blocked
          </Checkbox>
          <Checkbox checked={showProxy} onChange={(e) => setShowProxy(e.target.checked)}>
            Proxy
          </Checkbox>
        </div>
        <Button aria-label={t('download')} size="icon" onClick={download} className="ms-auto">
          <Download className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div
        className={cn(
            'mt-3 max-h-[60vh] overflow-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-xs leading-relaxed',
            isMobile && 'max-h-[70vh] p-2'
        )}
      >
        {orderedLogs.length === 0 ? (
          <div className="py-5 text-center opacity-50">No Record...</div>
        ) : isMobile ? (
            orderedLogs.map((log, idx) => (
            <div key={idx} className="border-b border-border py-2 last:border-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide" title={fullDate(log.DateTime)}>
                  {shortTime(log.DateTime)}
                </span>
                <Badge variant={eventBadge(log.Event)}>{eventLabel(log.Event)}</Badge>
              </div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="break-all">{log.FromAddress}</span>
                <span className="opacity-50">→</span>
                <span className="break-all">{log.ToAddress}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-75">
                {log.Inbound && (
                  <span className="inline-flex items-baseline gap-1 break-all">
                    <span className="text-[10px] uppercase tracking-wide opacity-60">in</span>
                    <span>{log.Inbound}</span>
                  </span>
                )}
                {log.Outbound && (
                  <span className="inline-flex items-baseline gap-1 break-all">
                    <span className="text-[10px] uppercase tracking-wide opacity-60">out</span>
                    <span>{log.Outbound}</span>
                  </span>
                )}
                {log.Email && (
                  <span className="inline-flex items-baseline gap-1 break-all">
                    <span className="text-[10px] uppercase tracking-wide opacity-60">email</span>
                    <span>{log.Email}</span>
                  </span>
                )}
              </div>
            </div>
            ))
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-start">
                <th className="px-4 py-0.5 text-start font-medium">Date</th>
                <th className="px-4 py-0.5 text-start font-medium">From</th>
                <th className="px-4 py-0.5 text-start font-medium">To</th>
                <th className="px-4 py-0.5 text-start font-medium">Inbound</th>
                <th className="px-4 py-0.5 text-start font-medium">Outbound</th>
                <th className="px-4 py-0.5 text-start font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {orderedLogs.map((log, idx) => (
                <tr key={idx} className={ROW_COLOR[log.Event ?? -1]}>
                  <td className="px-4 py-0.5 text-start">
                    <b>{fullDate(log.DateTime)}</b>
                  </td>
                  <td className="px-4 py-0.5 text-start">{log.FromAddress}</td>
                  <td className="px-4 py-0.5 text-start">{log.ToAddress}</td>
                  <td className="px-4 py-0.5 text-start">{log.Inbound}</td>
                  <td className="px-4 py-0.5 text-start">{log.Outbound}</td>
                  <td className="px-4 py-0.5 text-start">{log.Email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
    );
}
