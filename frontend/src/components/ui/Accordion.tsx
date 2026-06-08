import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

export interface AccordionItem {
  key: string;
  label: ReactNode;
  children: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Keys expanded on mount. Multiple panels may be open at once. */
  defaultActiveKeys?: string[];
  className?: string;
}

/**
 * Collapsible panel group (replaces antd `<Collapse>`). Multiple panels may be
 * open simultaneously; state is internal. Token-only, RTL-safe, lucide chevron.
 */
export function Accordion({ items, defaultActiveKeys = [], className }: AccordionProps)
{
    const [active, setActive] = useState<Set<string>>(() => new Set(defaultActiveKeys));

    const toggle = (key: string) =>
        setActive((prev) =>
        {
            const next = new Set(prev);
            if (next.has(key))
            {
                next.delete(key);
            }
            else
            {
                next.add(key);
            }
            return next;
        });

    return (
    <div className={cn('flex flex-col divide-y divide-border', className)}>
      {items.map((item) =>
      {
          const isOpen = active.has(item.key);
          return (
          <div key={item.key}>
            <button
              type="button"
              onClick={() => toggle(item.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 rounded-sm py-3 text-start text-sm font-medium text-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">{item.label}</span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150', isOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            {isOpen && <div className="pb-3">{item.children}</div>}
          </div>
          );
      })}
    </div>
    );
}
