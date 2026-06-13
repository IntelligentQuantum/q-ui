import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Upload, X } from 'lucide-react';

import { cn } from '@/components/ui';

export const TICKET_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.docx,.xlsx,.txt,.zip,.rar';
const MAX_FILES = 10;

function fmt(n: number): string
{
    if (n < 1024 * 1024)
    {
        return `${ Math.max(1, Math.round(n / 1024)) } KB`;
    }
    return `${ (n / (1024 * 1024)).toFixed(1) } MB`;
}

/**
 * FileDropZone is a modern multi-file picker: click to browse, drag & drop, or
 * paste a screenshot. Controlled via `files`/`onChange`. Token-only, RTL-safe.
 */
export default function FileDropZone({
    files,
    onChange,
    compact
}: {
  files: File[];
  onChange: (files: File[]) => void;
  compact?: boolean;
})
{
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    const add = useCallback((incoming: FileList | File[] | null) =>
    {
        if (!incoming)
        {
            return;
        }
        const next = [...files, ...Array.from(incoming)].slice(0, MAX_FILES);
        onChange(next);
    }, [files, onChange]);

    const onPaste = useCallback((e: React.ClipboardEvent) =>
    {
        const imgs: File[] = [];
        for (const item of Array.from(e.clipboardData.items))
        {
            if (item.kind === 'file')
            {
                const f = item.getAsFile();
                if (f)
                {
                    imgs.push(f);
                }
            }
        }
        if (imgs.length)
        {
            e.preventDefault();
            add(imgs);
        }
    }, [add]);

    return (
    <div className="flex flex-col gap-2" onPaste={onPaste}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) =>
        {
            e.preventDefault(); setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) =>
        {
            e.preventDefault();
            setDragOver(false);
            add(e.dataTransfer.files);
        }}
        className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'p-3' : 'p-6',
            dragOver && 'border-ring bg-accent-subtle/40'
        )}
      >
        <Upload className={cn('text-muted-foreground', compact ? 'h-4 w-4' : 'h-6 w-6')} aria-hidden />
        <span>{t('pages.tickets.dropHint')}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={TICKET_ACCEPT}
        className="hidden"
        onChange={(e) =>
        {
            add(e.target.files);
            e.target.value = '';
        }}
      />

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li key={`${ f.name }-${ i }`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(f.size)}</span>
              </span>
              <button
                type="button"
                aria-label={t('remove')}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
    );
}
