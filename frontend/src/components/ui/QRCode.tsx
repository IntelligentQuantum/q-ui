import { useMemo } from 'react';
import type { MouseEventHandler } from 'react';
import QRCodeLib from 'qrcode';
import { cn } from './cn';

export interface QRCodeProps {
  value: string;
  /** Rendered pixel size (square). The SVG scales crisply to any size. */
  size?: number;
  className?: string;
  /** QR colors. Defaults to black-on-white — keep high contrast for scanners. */
  color?: string;
  bgColor?: string;
  errorLevel?: 'L' | 'M' | 'Q' | 'H';
  onClick?: MouseEventHandler<SVGSVGElement>;
}

/**
 * QR code rendered as a crisp SVG (replaces antd's `<QRCode>`). The module
 * matrix comes from the `qrcode` lib; we draw the SVG ourselves so sizing,
 * colors and DOM stay under our control. Returns null for empty/oversized input.
 */
export function QRCode({
    value,
    size = 160,
    className,
    color = '#000000',
    bgColor = '#ffffff',
    errorLevel = 'M',
    onClick
}: QRCodeProps)
{
    const matrix = useMemo(() =>
    {
        if (!value)
        {
            return null;
        }
        try
        {
            const qr = QRCodeLib.create(value, { errorCorrectionLevel: errorLevel });
            return { count: qr.modules.size, data: qr.modules.data };
        }
        catch
        {
            return null;
        }
    }, [value, errorLevel]);

    const path = useMemo(() =>
    {
        if (!matrix)
        {
            return '';
        }
        const { count, data } = matrix;
        let d = '';
        for (let y = 0; y < count; y++)
        {
            for (let x = 0; x < count; x++)
            {
                if (data[y * count + x])
                {
                    d += `M${ x },${ y }h1v1h-1z`;
                }
            }
        }
        return d;
    }, [matrix]);

    if (!matrix)
    {
        return null;
    }
    const { count } = matrix;

    return (
    <svg
      className={cn('block', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${ count } ${ count }`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
      onClick={onClick}
    >
      <rect width={count} height={count} fill={bgColor} />
      <path d={path} fill={color} />
    </svg>
    );
}
