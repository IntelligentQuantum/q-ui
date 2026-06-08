import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import { Button, Checkbox, Drawer, Input, MultiSelect, cn } from '@/components/ui';
import type { InboundOption } from '@/hooks/useClients';
import { emptyFilters, type ClientFilters } from './filters';

interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ClientFilters;
  onChange: (next: ClientFilters) => void;
  inbounds: InboundOption[];
  protocols: string[];
  groups: string[];
}

const BUCKET_KEYS = ['active', 'expiring', 'depleted', 'deactive', 'online'] as const;

function Field({ label, children }: { label: ReactNode; children: ReactNode })
{
    return (
    <div className="mb-5 flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
    );
}

// Compact segmented toggle (replaces antd solid Radio.Group).
function Segmented({
    value,
    onChange,
    options
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
})
{
    return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
              'rounded px-3 py-1 text-sm transition-colors',
              value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
    );
}

export default function FilterDrawer({
    open,
    onOpenChange,
    filters,
    onChange,
    inbounds,
    protocols,
    groups
}: FilterDrawerProps)
{
    const { t } = useTranslation();

    function patch<K extends keyof ClientFilters>(key: K, value: ClientFilters[K])
    {
        onChange({ ...filters, [key]: value });
    }

    const inboundOptions = useMemo(
        () => inbounds.map((ib) => ({ value: String(ib.id), label: ib.remark?.trim() || ib.tag || '' })),
        [inbounds]
    );
    const protocolOptions = useMemo(() => protocols.map((p) => ({ value: p, label: p })), [protocols]);
    const groupOptions = useMemo(() => groups.map((g) => ({ value: g, label: g })), [groups]);

    const toggleBucket = (k: string) =>
    {
        const set = new Set(filters.buckets);
        if (set.has(k))
        {
            set.delete(k);
        }
        else
        {
            set.add(k);
        }
        patch('buckets', [...set]);
    };

    const tribool = [
        { value: '', label: t('all') },
        { value: 'yes', label: t('pages.clients.has') },
        { value: 'no', label: t('pages.clients.hasNot') }
    ];

    return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      title={t('pages.clients.filterTitle')}
      width={420}
      footer={
        <div className="flex items-center justify-between">
          <Button variant="danger" onClick={() => onChange(emptyFilters())}>
            {t('pages.clients.clearAllFilters')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('done')}</Button>
        </div>
      }
    >
      <Field label={t('status')}>
        <div className="flex flex-col gap-2">
          {BUCKET_KEYS.map((k) => (
            <Checkbox key={k} checked={filters.buckets.includes(k)} onChange={() => toggleBucket(k)}>
              {bucketLabel(k, t)}
            </Checkbox>
          ))}
        </div>
      </Field>

      <Field label={t('pages.inbounds.protocol')}>
        <MultiSelect
          value={filters.protocols}
          onChange={(v) => patch('protocols', v)}
          options={protocolOptions}
          placeholder={t('pages.inbounds.protocol')}
        />
      </Field>

      <Field label={t('inbounds')}>
        <MultiSelect
          value={filters.inboundIds.map(String)}
          onChange={(v) => patch('inboundIds', v.map(Number))}
          options={inboundOptions}
          placeholder={t('inbounds')}
        />
      </Field>

      <Field label={t('pages.clients.group')}>
        <MultiSelect
          value={filters.groups}
          onChange={(v) => patch('groups', v)}
          options={groupOptions}
          placeholder={t('pages.clients.groupPlaceholder')}
        />
      </Field>

      <Field label={t('pages.clients.expiryTime')}>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.expiryFrom ? dayjs(filters.expiryFrom).format('YYYY-MM-DD') : ''}
            onChange={(e) =>
                patch('expiryFrom', e.target.value ? dayjs(e.target.value).startOf('day').valueOf() : undefined)
            }
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={filters.expiryTo ? dayjs(filters.expiryTo).format('YYYY-MM-DD') : ''}
            onChange={(e) =>
                patch('expiryTo', e.target.value ? dayjs(e.target.value).endOf('day').valueOf() : undefined)
            }
          />
        </div>
      </Field>

      <Field label={`${ t('pages.clients.traffic') } (GB)`}>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            placeholder={t('from')}
            value={filters.usageFromGB ?? ''}
            onChange={(e) => patch('usageFromGB', e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <Input
            type="number"
            min={0}
            step={1}
            placeholder={t('to')}
            value={filters.usageToGB ?? ''}
            onChange={(e) => patch('usageToGB', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      </Field>

      <Field label={t('pages.clients.renew')}>
        <Segmented
          value={filters.autoRenew}
          onChange={(v) => patch('autoRenew', v as ClientFilters['autoRenew'])}
          options={[
              { value: '', label: t('all') },
              { value: 'on', label: t('enabled') },
              { value: 'off', label: t('disabled') }
          ]}
        />
      </Field>

      <Field label={t('pages.clients.telegramId')}>
        <Segmented value={filters.hasTgId} onChange={(v) => patch('hasTgId', v as ClientFilters['hasTgId'])} options={tribool} />
      </Field>

      <Field label={t('pages.clients.comment')}>
        <Segmented value={filters.hasComment} onChange={(v) => patch('hasComment', v as ClientFilters['hasComment'])} options={tribool} />
      </Field>
    </Drawer>
    );
}

function bucketLabel(key: string, t: (k: string) => string): string
{
    switch (key)
    {
        case 'active': return t('subscription.active');
        case 'expiring': return t('depletingSoon');
        case 'depleted': return t('depleted');
        case 'deactive': return t('disabled');
        case 'online': return t('online');
        default: return key;
    }
}
