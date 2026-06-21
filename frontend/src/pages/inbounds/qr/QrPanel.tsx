import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCode } from '@/components/ui';
import { message } from '@/components/ui/message';
import { Copy, Download, Image as ImageIcon } from 'lucide-react';

import { ClipboardManager, FileManager } from '@/utils';
import { Badge, Button, Tooltip } from '@/components/ui';

interface QrPanelProps {
  value: string;
  remark?: string;
  downloadName?: string;
  size?: number;
  showQr?: boolean;
}

async function svgToPngBlob(svgEl: SVGSVGElement | null, size: number): Promise<Blob | null>
{
    if (!svgEl)
    {
        return null;
    }
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    return new Promise<Blob | null>((resolve) =>
    {
        const img = new Image();
        img.onload = () =>
        {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx)
            {
                URL.revokeObjectURL(url);
                resolve(null);
                return;
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        };
        img.onerror = () =>
        {
            URL.revokeObjectURL(url); resolve(null);
        };
        img.src = url;
    });
}

function downloadImageBlob(blob: Blob, remark: string)
{
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ remark || 'qrcode' }.png`;
    link.click();
    URL.revokeObjectURL(url);
}

export default function QrPanel({
    value,
    remark = '',
    downloadName = '',
    size = 360,
    showQr = true
}: QrPanelProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const qrRef = useRef<HTMLDivElement | null>(null);

    async function copy()
    {
        const ok = await ClipboardManager.copyText(value);
        if (ok)
        {
            messageApi.success(t('copied'));
        }
    }

    function download()
    {
        if (!downloadName)
        {
            return;
        }
        FileManager.downloadTextFile(value, downloadName);
    }

    async function copyImage()
    {
        const svgEl = qrRef.current?.querySelector('svg') as SVGSVGElement | null;
        const blob = await svgToPngBlob(svgEl, size);
        if (!blob)
        {
            return;
        }
        try
        {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            messageApi.success(t('copied'));
        }
        catch
        {
            downloadImageBlob(blob, remark);
        }
    }

    async function downloadImage()
    {
        const svgEl = qrRef.current?.querySelector('svg') as SVGSVGElement | null;
        const blob = await svgToPngBlob(svgEl, size);
        if (blob)
        {
            downloadImageBlob(blob, remark);
        }
    }

    const downloadImageLabel = t('downloadImage') !== 'downloadImage' ? t('downloadImage') : 'Download Image';

    return (
    <div className="mb-2.5 flex flex-col gap-1.5 rounded-md border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="success">{remark}</Badge>
        <Tooltip content={t('copy')}>
          <Button aria-label={t('copy')} variant="secondary" size="icon" className="h-8 w-8" onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
        </Tooltip>
        {showQr && (
          <Tooltip content={downloadImageLabel}>
            <Button aria-label={downloadImageLabel} variant="secondary" size="icon" className="h-8 w-8" onClick={downloadImage}>
              <ImageIcon className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        )}
        {downloadName && (
          <Tooltip content={t('download')}>
            <Button aria-label={t('download')} variant="secondary" size="icon" className="h-8 w-8" onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
            </Button>
          </Tooltip>
        )}
      </div>
      {showQr && (
        <div ref={qrRef} className="flex justify-center py-1.5">
          <Tooltip content={t('copy')}>
            <QRCode
              className="cursor-pointer rounded-sm bg-white leading-none [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[360px]"
              value={value}
              size={size}
              onClick={copyImage}
            />
          </Tooltip>
        </div>
      )}
    </div>
    );
}
