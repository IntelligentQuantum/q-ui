import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileArchive, FileText, FileSpreadsheet } from 'lucide-react';

import { Modal } from '@/components/ui';

export interface TicketAttachment {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'document' | 'archive';
}

function attachmentUrl(ticketId: number, attachmentId: number): string
{
    return `${ window.Q_UI_BASE_PATH || '/' }panel/api/tickets/${ ticketId }/attachments/${ attachmentId }`.replace(/\/{2,}/g, '/');
}

function formatBytes(n: number): string
{
    if (n < 1024)
    {
        return `${ n } B`;
    }
    if (n < 1024 * 1024)
    {
        return `${ (n / 1024).toFixed(1) } KB`;
    }
    return `${ (n / (1024 * 1024)).toFixed(1) } MB`;
}

function DocIcon({ name }: { name: string })
{
    const lower = name.toLowerCase();
    if (lower.endsWith('.xlsx'))
    {
        return <FileSpreadsheet className="h-5 w-5 text-success" aria-hidden />;
    }
    return <FileText className="h-5 w-5 text-accent" aria-hidden />;
}

/**
 * AttachmentViewer renders a message's files: images as clickable thumbnails
 * (full-size in a modal — no download needed), videos as inline players, and
 * documents/archives as open/download cards. All bytes come from the
 * authenticated, ownership-checked streaming endpoint (cookies ride along).
 */
export default function AttachmentViewer({ ticketId, attachments }: { ticketId: number; attachments: TicketAttachment[] })
{
    const { t } = useTranslation();
    const [zoom, setZoom] = useState<TicketAttachment | null>(null);

    if (!attachments || attachments.length === 0)
    {
        return null;
    }

    return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {attachments.map((att) =>
        {
            const url = attachmentUrl(ticketId, att.id);
            if (att.kind === 'image')
            {
                return (
              <button
                key={att.id}
                type="button"
                onClick={() => setZoom(att)}
                className="group relative overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={att.originalName}
              >
                <img
                  src={url}
                  alt={att.originalName}
                  loading="lazy"
                  className="h-28 w-28 object-cover transition-transform duration-200 group-hover:scale-105 sm:h-32 sm:w-32"
                />
              </button>
                );
            }
            if (att.kind === 'video')
            {
                return (
              <video
                key={att.id}
                src={url}
                controls
                preload="metadata"
                className="max-h-72 w-full max-w-md rounded-lg border border-border bg-black"
              />
                );
            }
            const isPdf = att.mimeType === 'application/pdf';
            return (
            <a
              key={att.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              download={isPdf ? undefined : att.originalName}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm transition-colors hover:bg-foreground/[0.04]"
              title={att.originalName}
            >
              {att.kind === 'archive' ? <FileArchive className="h-5 w-5 text-warning" aria-hidden /> : <DocIcon name={att.originalName} />}
              <span className="flex min-w-0 flex-col">
                <span className="max-w-[180px] truncate font-medium text-foreground">{att.originalName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(att.size)} · {isPdf ? t('view') : t('download')}
                </span>
              </span>
              {!isPdf && <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            </a>
            );
        })}
      </div>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.originalName} size="xl">
        {zoom && (
          <div className="flex justify-center">
            <img src={attachmentUrl(ticketId, zoom.id)} alt={zoom.originalName} className="max-h-[75vh] w-auto rounded-lg" />
          </div>
        )}
      </Modal>
    </>
    );
}
