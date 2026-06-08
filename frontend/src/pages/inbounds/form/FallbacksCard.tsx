import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@/components/ui';
import type { FallbackRow } from '@/schemas/forms/inbound-form';

interface FallbacksCardProps {
  fallbacks: FallbackRow[];
  fallbackChildOptions: { label: string; value: number }[];
  addFallback: () => void;
  updateFallback: (rowKey: string, patch: Partial<FallbackRow>) => void;
  removeFallback: (idx: number) => void;
  moveFallback: (idx: number, direction: -1 | 1) => void;
  addAllFallbacks: () => void;
}

function Addon({ label, children }: { label: ReactNode; children: ReactNode })
{
    return (
    <div className="flex items-center">
      <span className="grid h-9 shrink-0 place-items-center rounded-s-md border border-e-0 border-border bg-surface-sunken px-2.5 text-xs text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
    );
}

export default function FallbacksCard({
    fallbacks,
    fallbackChildOptions,
    addFallback,
    updateFallback,
    removeFallback,
    moveFallback,
    addAllFallbacks
}: FallbacksCardProps)
{
    const { t } = useTranslation();
    const any = t('pages.inbounds.fallbacks.matchAny') || 'any';
    const pick = t('pages.inbounds.fallbacks.pickInbound') || 'Pick an inbound';
    return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.inbounds.fallbacks.title') || 'Fallbacks'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {fallbacks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            {t('pages.inbounds.fallbacks.empty') || 'No fallbacks yet'}
          </div>
        )}
        {fallbacks.map((record, idx) => (
          <div key={record.rowKey} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={record.childId == null ? '' : String(record.childId)}
                  placeholder={pick}
                  onChange={(v) => updateFallback(record.rowKey, { childId: v === '' ? null : Number(v) })}
                  options={[{ value: '', label: pick }, ...fallbackChildOptions.map((o) => ({ value: String(o.value), label: o.label }))]}
                />
              </div>
              <Button variant="secondary" size="icon" disabled={idx === 0} aria-label={t('pages.inbounds.form.moveUp')} onClick={() => moveFallback(idx, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                disabled={idx === fallbacks.length - 1}
                aria-label={t('pages.inbounds.form.moveDown')}
                onClick={() => moveFallback(idx, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => removeFallback(idx)}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Addon label="SNI">
                <Input className="rounded-s-none" placeholder={any} value={record.name} onChange={(e) => updateFallback(record.rowKey, { name: e.target.value })} />
              </Addon>
              <Addon label="ALPN">
                <Input className="rounded-s-none" placeholder={any} value={record.alpn} onChange={(e) => updateFallback(record.rowKey, { alpn: e.target.value })} />
              </Addon>
              <Addon label="Path">
                <Input className="rounded-s-none" placeholder="/" value={record.path} onChange={(e) => updateFallback(record.rowKey, { path: e.target.value })} />
              </Addon>
              <Addon label="Dest">
                <Input
                  className="rounded-s-none"
                  placeholder={t('pages.inbounds.fallbacks.destPlaceholder') || 'auto'}
                  value={record.dest}
                  onChange={(e) => updateFallback(record.rowKey, { dest: e.target.value })}
                />
              </Addon>
              <Addon label="xver">
                <Input
                  className="rounded-s-none"
                  type="number"
                  min={0}
                  max={2}
                  value={record.xver}
                  onChange={(e) => updateFallback(record.rowKey, { xver: Number(e.target.value) || 0 })}
                />
              </Addon>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={addFallback}>
            <Plus className="h-4 w-4" />
            {t('pages.inbounds.fallbacks.add') || 'Add fallback'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={addAllFallbacks}
            disabled={fallbackChildOptions.length === 0 || fallbacks.length >= fallbackChildOptions.length}
          >
            {t('pages.inbounds.form.addAll')}
          </Button>
        </div>
      </CardContent>
    </Card>
    );
}
