import { Tooltip, Badge } from '@/components/ui';
import { SizeFormatter } from '@/utils';
import type { InboundSpeedEntry } from './types';

// True when an inbound has live throughput worth showing.
export function isActiveSpeed(speed?: InboundSpeedEntry): speed is InboundSpeedEntry
{
    return !!speed && (speed.up > 0 || speed.down > 0);
}

interface InboundSpeedTagProps
{
    speed: InboundSpeedEntry;
    withTooltip?: boolean;
}

// Blue "↑ up / ↓ down" rate badge, optionally with a stacked breakdown tooltip.
export function InboundSpeedTag({ speed, withTooltip = false }: InboundSpeedTagProps)
{
    const badge = (
        <Badge variant="primary">
            ↑ {SizeFormatter.speedFormat(speed.up)}
            {' / '}
            ↓ {SizeFormatter.speedFormat(speed.down)}
        </Badge>
    );
    if (!withTooltip)
    {
        return badge;
    }
    return (
        <Tooltip
            content={
                <div className="text-xs">
                    <div>↑ {SizeFormatter.speedFormat(speed.up)}</div>
                    <div>↓ {SizeFormatter.speedFormat(speed.down)}</div>
                </div>
            }
        >
            {badge}
        </Tooltip>
    );
}
