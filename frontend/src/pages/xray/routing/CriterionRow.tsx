import { Tooltip } from '@/components/ui';

import { csv } from './helpers';

export default function CriterionRow({ label, value, title }: { label: string; value?: string; title: string })
{
    const parts = csv(value);
    if (parts.length === 0)
    {
        return null;
    }
    return (
    <Tooltip content={title}>
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="font-medium">{parts[0]}</span>
        {parts.length > 1 && (
          <span className="rounded-full bg-foreground/[0.06] px-1.5 text-[11px] text-muted-foreground">
            +{parts.length - 1}
          </span>
        )}
      </span>
    </Tooltip>
    );
}
