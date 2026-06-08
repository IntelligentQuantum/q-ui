import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw } from 'lucide-react';

import { HttpUtil, FileManager, PromiseUtil } from '@/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button, Checkbox, Modal, Select, cn } from '@/components/ui';

interface LogModalProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedLog {
  date: string;
  time: string;
  stamp: string;
  levelText: string;
  levelClass: string;
  service: string;
  body: string;
}

const LEVELS = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR'];
const LEVEL_CLASSES = ['level-debug', 'level-info', 'level-notice', 'level-warning', 'level-error'];

// Token-based color per log level (replaces the old hard-coded CSS palette).
const LEVEL_COLOR: Record<string, string> = {
    'level-debug': 'text-accent',
    'level-info': 'text-success',
    'level-notice': 'text-success',
    'level-warning': 'text-warning',
    'level-error': 'text-danger',
    'level-unknown': 'text-muted-foreground'
};

function parseLogLine(line: string): ParsedLog
{
    const [head, ...rest] = (line || '').split(' - ');
    const message = rest.join(' - ');
    const parts = head.split(' ');

    let date = '';
    let time = '';
    let levelText: string;
    if (parts.length >= 3)
    {
        [date, time, levelText] = parts;
    }
    else
    {
        levelText = head;
    }

    const li = LEVELS.indexOf(levelText);
    const levelClass = li >= 0 ? LEVEL_CLASSES[li] : 'level-unknown';

    let service = '';
    let body = message || '';
    if (body.startsWith('XRAY:'))
    {
        service = 'XRAY:';
        body = body.slice('XRAY:'.length).trimStart();
    }
    else if (body)
    {
        service = 'Q-UI:';
    }

    const stamp = [date, time].filter(Boolean).join(' ');

    return { date, time, stamp, levelText, levelClass, service, body };
}

export default function LogModal({ open, onClose }: LogModalProps)
{
    const { t } = useTranslation();
    const { isMobile } = useMediaQuery();
    const [rows, setRows] = useState('20');
    const [level, setLevel] = useState('info');
    const [syslog, setSyslog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const openRef = useRef(open);

    const refresh = useCallback(async () =>
    {
        setLoading(true);
        try
        {
            const msg = await HttpUtil.post<string[]>(`/panel/api/server/logs/${ rows }`, {
                level,
                syslog
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
    }, [rows, level, syslog]);

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
    }, [rows, level, syslog, refresh]);

    const parsedLogs = useMemo(() => logs.map(parseLogLine), [logs]);

    function download()
    {
        FileManager.downloadTextFile(logs.join('\n'), 'q-ui.log');
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
        <div className="flex items-center gap-2">
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
          <Select
            value={level}
            onChange={setLevel}
            className="w-[100px]"
            options={[
                { value: 'debug', label: 'Debug' },
                { value: 'info', label: 'Info' },
                { value: 'notice', label: 'Notice' },
                { value: 'warning', label: 'Warning' },
                { value: 'err', label: 'Error' }
            ]}
          />
        </div>
        <Checkbox checked={syslog} onChange={(e) => setSyslog(e.target.checked)}>
          SysLog
        </Checkbox>
        <Button
          aria-label={t('download')}
          size="icon"
          onClick={download}
          className="ms-auto"
        >
          <Download className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div
        className={cn(
            'mt-3 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-xs leading-relaxed',
            isMobile ? 'max-h-[70vh] whitespace-normal' : 'whitespace-pre-wrap break-words'
        )}
      >
        {parsedLogs.length === 0 ? (
          <div className="py-5 text-center opacity-50">No Record...</div>
        ) : isMobile ? (
            parsedLogs.map((log, idx) => (
            <div key={idx} className="border-b border-border py-2 last:border-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                {log.stamp && (
                  <span className="inline-flex items-baseline gap-1.5 text-xs font-semibold tracking-wide">
                    {log.time && <span>{log.time}</span>}
                    {log.date && <span className="text-[10px] font-medium opacity-55">{log.date}</span>}
                  </span>
                )}
                {log.levelText && (
                  <span
                    className={cn(
                        'inline-block rounded border border-current px-1.5 py-px text-[10px] font-semibold tracking-wide',
                        LEVEL_COLOR[log.levelClass]
                    )}
                  >
                    {log.levelText}
                  </span>
                )}
              </div>
              {(log.body || log.service) && (
                <div className="break-words text-xs">
                  {log.service && <b>{log.service}</b>}
                  {log.service && log.body ? ' ' : ''}
                  {log.body && <span className="ms-1">{log.body}</span>}
                </div>
              )}
            </div>
            ))
        ) : (
            parsedLogs.map((log, idx) => (
            <div key={idx} className="mt-0.5 first:mt-0">
              {log.stamp && <span className="text-accent">{log.stamp}</span>}
              {log.stamp && log.levelText ? ' ' : ''}
              {log.levelText && (
                <span className={cn('ms-1', LEVEL_COLOR[log.levelClass])}>{log.levelText}</span>
              )}
              {(log.body || log.service) && (
                <>
                  <span> - </span>
                  {log.service && <b>{log.service}</b>}
                  {log.service && log.body ? ' ' : ''}
                  <span>{log.body}</span>
                </>
              )}
            </div>
            ))
        )}
      </div>
    </Modal>
    );
}
