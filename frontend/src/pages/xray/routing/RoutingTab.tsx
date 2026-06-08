import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, List, Plus } from 'lucide-react';

import { Button, Tabs, cn, confirm } from '@/components/ui';
import RoutingBasic from './RoutingBasic';
import RuleFormModal from './RuleFormModal';
import type { RoutingRule } from './RuleFormModal';
import RuleCardList from './RuleCardList';
import { useRoutingColumns } from './useRoutingColumns';
import { arrJoin } from './helpers';
import type { RuleRow } from './types';
import type { XraySettingsValue, SetTemplate } from '@/hooks/useXraySetting';
import type { RuleObject } from '@/schemas/routing';

interface RoutingTabProps {
  templateSettings: XraySettingsValue | null;
  setTemplateSettings: SetTemplate;
  inboundTags: string[];
  clientReverseTags: string[];
  isMobile: boolean;
}

export default function RoutingTab({
    templateSettings,
    setTemplateSettings,
    inboundTags,
    clientReverseTags,
    isMobile
}: RoutingTabProps)
{
    const { t } = useTranslation();
    const [section, setSection] = useState('basic');
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
    const dragRef = useRef<{ from: number | null; to: number | null; startY: number; moved: boolean }>({
        from: null,
        to: null,
        startY: 0,
        moved: false
    });

    const rules = useMemo(
        () => (templateSettings?.routing?.rules || []) as RoutingRule[],
        [templateSettings?.routing?.rules]
    );
    const rulesRef = useRef(rules);
    rulesRef.current = rules;

    const rows: RuleRow[] = useMemo(
        () =>
            rules.map((rule, idx) =>
            {
                const r: RuleRow = { key: idx };
                r.domain = arrJoin(rule.domain);
                r.ip = arrJoin(rule.ip);
                r.port = rule.port;
                r.sourcePort = rule.sourcePort;
                r.vlessRoute = rule.vlessRoute;
                r.network = rule.network;
                r.sourceIP = arrJoin(rule.sourceIP);
                r.user = arrJoin(rule.user);
                r.inboundTag = arrJoin(rule.inboundTag);
                r.protocol = arrJoin(rule.protocol);
                if (rule.attrs && typeof rule.attrs === 'object' && !Array.isArray(rule.attrs))
                {
                    r.attrs = JSON.stringify(rule.attrs, null, 2);
                }
                r.outboundTag = rule.outboundTag;
                r.balancerTag = rule.balancerTag;
                return r;
            }),
        [rules]
    );

    const mutate = useCallback(
        (mutator: (next: XraySettingsValue) => void) =>
        {
            setTemplateSettings((prev) =>
            {
                if (!prev)
                {
                    return prev;
                }
                const clone = JSON.parse(JSON.stringify(prev)) as XraySettingsValue;
                mutator(clone);
                return clone;
            });
        },
        [setTemplateSettings]
    );

    const inboundTagOptions = useMemo(() =>
    {
        const seen = new Set<string>();
        const out: string[] = [];
        const push = (tag?: string) =>
        {
            if (!tag || seen.has(tag))
            {
                return;
            }
            seen.add(tag);
            out.push(tag);
        };
        for (const ib of (templateSettings?.inbounds as Array<{ tag?: string }>) || [])
        {
            push(ib?.tag);
        }
        for (const tag of inboundTags || [])
        {
            push(tag);
        }
        for (const ob of templateSettings?.outbounds || [])
        {
            const obx = ob as { reverse?: { tag?: string }; settings?: { reverse?: { tag?: string }; inboundTag?: string } };
            push(obx?.reverse?.tag || obx?.settings?.reverse?.tag || obx?.settings?.inboundTag);
        }
        push((templateSettings?.dns as { tag?: string } | undefined)?.tag);
        for (const s of (templateSettings?.dns as { servers?: Array<{ tag?: string }> } | undefined)?.servers || [])
        {
            if (typeof s === 'object' && s?.tag)
            {
                push(s.tag);
            }
        }
        return out;
    }, [templateSettings, inboundTags]);

    const outboundTagOptions = useMemo(() =>
    {
        const out = new Set<string>(['']);
        for (const ob of templateSettings?.outbounds || [])
        {
            if (ob?.tag)
            {
                out.add(ob.tag);
            }
        }
        for (const tag of clientReverseTags || [])
        {
            if (tag)
            {
                out.add(tag);
            }
        }
        return [...out];
    }, [templateSettings?.outbounds, clientReverseTags]);

    const balancerTagOptions = useMemo(() =>
    {
        const out: string[] = [''];
        for (const b of (templateSettings?.routing?.balancers as Array<{ tag?: string }>) || [])
        {
            if (b?.tag)
            {
                out.push(b.tag);
            }
        }
        return out;
    }, [templateSettings?.routing?.balancers]);

    function openAdd()
    {
        setEditingRule(null);
        setEditingIndex(null);
        setRuleModalOpen(true);
    }
    function openEdit(idx: number)
    {
        setEditingRule(rulesRef.current[idx]);
        setEditingIndex(idx);
        setRuleModalOpen(true);
    }
    function onRuleConfirm(rule: Record<string, unknown>)
    {
        if (JSON.stringify(rule).length <= 3)
        {
            setRuleModalOpen(false);
            return;
        }
        mutate((tt) =>
        {
            if (!tt.routing)
            {
                tt.routing = { rules: [] };
            }
            if (!Array.isArray(tt.routing.rules))
            {
                tt.routing.rules = [];
            }
            const typed = rule as unknown as RuleObject;
            if (editingIndex == null)
            {
                tt.routing.rules.push(typed);
            }
            else
            {
                tt.routing.rules[editingIndex] = typed;
            }
        });
        setRuleModalOpen(false);
    }

    async function confirmDelete(idx: number)
    {
        const ok = await confirm({
            title: `${ t('delete') } ${ t('pages.xray.Routings') } #${ idx + 1 }?`,
            confirmText: t('delete'),
            cancelText: t('cancel'),
            danger: true
        });
        if (ok)
        {
            mutate((tt) =>
            {
                tt.routing?.rules?.splice(idx, 1);
            });
        }
    }

    function moveUp(idx: number)
    {
        if (idx <= 0)
        {
            return;
        }
        mutate((tt) =>
        {
            const list = tt.routing?.rules;
            if (!list)
            {
                return;
            }
            [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        });
    }
    function moveDown(idx: number)
    {
        mutate((tt) =>
        {
            const list = tt.routing?.rules;
            if (!list || idx >= list.length - 1)
            {
                return;
            }
            [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        });
    }

    function onHandlePointerDown(idx: number, ev: React.PointerEvent)
    {
        if (ev.button != null && ev.button !== 0)
        {
            return;
        }
        ev.preventDefault();
        try
        {
            (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
        }
        catch
        { /* ignore */ }
        dragRef.current = { from: idx, to: idx, startY: ev.clientY, moved: false };
        setDraggedIndex(idx);
        setDropTargetIndex(idx);

        const onMove = (e: PointerEvent) =>
        {
            const state = dragRef.current;
            if (state.from == null)
            {
                return;
            }
            if (!state.moved && Math.abs(e.clientY - state.startY) < 5)
            {
                return;
            }
            state.moved = true;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el)
            {
                return;
            }
            const target = el.closest('[data-row-key]');
            if (!target)
            {
                return;
            }
            const newIdx = Number(target.getAttribute('data-row-key'));
            if (Number.isFinite(newIdx) && newIdx !== state.to)
            {
                state.to = newIdx;
                setDropTargetIndex(newIdx);
            }
        };

        const onUp = () =>
        {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            const { from, to, moved } = dragRef.current;
            dragRef.current = { from: null, to: null, startY: 0, moved: false };
            setDraggedIndex(null);
            setDropTargetIndex(null);
            if (!moved || from == null || to == null || from === to)
            {
                return;
            }
            mutate((tt) =>
            {
                const list = tt.routing?.rules;
                if (!list)
                {
                    return;
                }
                const [movedItem] = list.splice(from, 1);
                list.splice(to, 0, movedItem);
            });
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    }

    const hasSource = rows.some((r) => r.sourceIP || r.sourcePort || r.vlessRoute);
    const hasBalancer = rows.some((r) => r.balancerTag);

    const desktopColumns = useRoutingColumns({
        isMobile,
        rowsLength: rows.length,
        showSource: hasSource,
        showBalancer: hasBalancer,
        onHandlePointerDown,
        openEdit,
        moveUp,
        moveDown,
        confirmDelete
    });

    const visibleColumns = desktopColumns.filter((c) => !c.hidden);

    const rulesBody = (
    <div className="flex w-full flex-col gap-4">
      <Button onClick={openAdd} className="self-start">
        <Plus className="h-4 w-4" aria-hidden />
        {t('pages.xray.Routings')}
      </Button>

      {isMobile ? (
        <RuleCardList
          rows={rows}
          draggedIndex={draggedIndex}
          dropTargetIndex={dropTargetIndex}
          onHandlePointerDown={onHandlePointerDown}
          openEdit={openEdit}
          moveUp={moveUp}
          moveDown={moveDown}
          confirmDelete={confirmDelete}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                        'whitespace-nowrap px-3 py-2.5 font-medium text-muted-foreground',
                        col.align === 'center' ? 'text-center' : col.align === 'end' ? 'text-end' : 'text-start'
                    )}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-3 py-10 text-center text-muted-foreground">
                    —
                  </td>
                </tr>
              ) : (
                  rows.map((record, index) =>
                  {
                      const isDragging = draggedIndex === index;
                      const showDrop = dropTargetIndex === index && draggedIndex !== index && draggedIndex != null;
                      const dropAfter = showDrop && index > (draggedIndex ?? -1);
                      return (
                    <tr
                      key={record.key}
                      data-row-key={index}
                      className={cn(
                          'border-b border-border transition-[opacity,box-shadow] last:border-0',
                          isDragging && 'opacity-40',
                          showDrop && (dropAfter
                              ? 'shadow-[inset_0_-2px_0_0_var(--color-accent)]'
                              : 'shadow-[inset_0_2px_0_0_var(--color-accent)]')
                      )}
                    >
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                              'px-3 py-2.5 align-top text-foreground',
                              col.align === 'center' ? 'text-center' : col.align === 'end' ? 'text-end' : 'text-start'
                          )}
                        >
                          {col.render(record, index)}
                        </td>
                      ))}
                    </tr>
                      );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
    );

    return (
    <>
      <Tabs
        tabs={[
            { key: 'basic', label: t('pages.xray.basicRouting'), icon: <SlidersHorizontal className="h-4 w-4" /> },
            { key: 'rules', label: t('pages.xray.Routings'), icon: <List className="h-4 w-4" /> }
        ]}
        value={section}
        onChange={setSection}
      />

      <div className="mt-4">
        {section === 'basic' ? (
          <RoutingBasic templateSettings={templateSettings} setTemplateSettings={setTemplateSettings} />
        ) : (
            rulesBody
        )}
      </div>

      <RuleFormModal
        open={ruleModalOpen}
        rule={editingRule}
        inboundTags={inboundTagOptions}
        outboundTags={outboundTagOptions}
        balancerTags={balancerTagOptions}
        onClose={() => setRuleModalOpen(false)}
        onConfirm={onRuleConfirm}
      />
    </>
    );
}
