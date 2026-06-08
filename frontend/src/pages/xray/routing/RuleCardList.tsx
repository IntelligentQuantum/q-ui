import { useTranslation } from 'react-i18next';
import {
    GripVertical,
    Pencil,
    Trash2,
    ArrowUp,
    ArrowDown,
    ExternalLink,
    Network,
    ArrowRight
} from 'lucide-react';

import { Badge, DropdownMenu, Tooltip, cn } from '@/components/ui';
import { chipPreview, ruleCriteriaChips } from './helpers';
import type { RuleRow } from './types';

interface RuleCardListProps {
  rows: RuleRow[];
  draggedIndex: number | null;
  dropTargetIndex: number | null;
  onHandlePointerDown: (idx: number, ev: React.PointerEvent) => void;
  openEdit: (idx: number) => void;
  moveUp: (idx: number) => void;
  moveDown: (idx: number) => void;
  confirmDelete: (idx: number) => void;
}

export default function RuleCardList({
    rows,
    draggedIndex,
    dropTargetIndex,
    onHandlePointerDown,
    openEdit,
    moveUp,
    moveDown,
    confirmDelete
}: RuleCardListProps)
{
    const { t } = useTranslation();
    return (
    <div className="flex flex-col gap-3.5">
      {rows.length === 0 ? (
        <div className="py-6 text-center opacity-40">—</div>
      ) : (
          rows.map((rule, index) =>
          {
              const dropBefore =
            dropTargetIndex === index && draggedIndex != null && index < draggedIndex;
              const dropAfter =
            dropTargetIndex === index && draggedIndex != null && index > draggedIndex;
              const criteria = ruleCriteriaChips(rule);
              return (
            <div
              key={rule.key}
              data-row-key={index}
              className={cn(
                  'relative flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-sm transition-[opacity,box-shadow]',
                  draggedIndex === index && 'opacity-40',
                  dropBefore && 'shadow-[inset_0_2px_0_0_var(--color-accent)]',
                  dropAfter && 'shadow-[inset_0_-2px_0_0_var(--color-accent)]'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  role="button"
                  tabIndex={0}
                  onPointerDown={(ev) => onHandlePointerDown(index, ev)}
                  className="grid h-7 w-7 cursor-grab touch-none place-items-center rounded text-muted-foreground opacity-50 transition-opacity hover:opacity-90 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-[13px] font-semibold text-muted-foreground">#{index + 1}</span>
                <DropdownMenu
                  align="end"
                  label={t('more')}
                  items={[
                      {
                          key: 'edit',
                          label: t('edit'),
                          icon: <Pencil className="h-4 w-4" aria-hidden />,
                          onSelect: () => openEdit(index)
                      },
                      {
                          key: 'up',
                          label: <ArrowUp className="h-4 w-4" aria-hidden />,
                          disabled: index === 0,
                          onSelect: () => moveUp(index)
                      },
                      {
                          key: 'down',
                          label: <ArrowDown className="h-4 w-4" aria-hidden />,
                          disabled: index === rows.length - 1,
                          onSelect: () => moveDown(index)
                      },
                      {
                          key: 'del',
                          danger: true,
                          label: t('delete'),
                          icon: <Trash2 className="h-4 w-4" aria-hidden />,
                          onSelect: () => confirmDelete(index)
                      }
                  ]}
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('pages.xray.Inbounds')}
                  </span>
                  {rule.inboundTag ? (
                    <Badge variant="primary" className="max-w-full truncate">{chipPreview(rule.inboundTag)}</Badge>
                  ) : (
                    <span className="opacity-40">any</span>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col items-end gap-1 text-end">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {rule.balancerTag ? t('pages.xray.balancer') || 'Balancer' : t('pages.xray.Outbounds')}
                  </span>
                  {rule.outboundTag ? (
                    <Badge variant="success" className="max-w-full gap-1 truncate">
                      <ExternalLink className="h-3 w-3" aria-hidden /> {rule.outboundTag}
                    </Badge>
                  ) : rule.balancerTag ? (
                    <Badge variant="primary" className="max-w-full gap-1 truncate">
                      <Network className="h-3 w-3" aria-hidden /> {rule.balancerTag}
                    </Badge>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </div>
              </div>

              {criteria.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-dashed border-border pt-1.5">
                  {criteria.map((chip) => (
                    <Tooltip key={chip.label} content={`${ chip.label }: ${ chip.value }`}>
                      <span className="inline-flex max-w-full items-baseline gap-1 truncate rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11px]">
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{chip.label}</span>
                        <span className="font-medium">{chipPreview(chip.value)}</span>
                      </span>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
              );
          })
      )}
    </div>
    );
}
