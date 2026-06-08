import { useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, X } from 'lucide-react';

import { Button, Input, Label, Modal, Select, Switch, cn } from '@/components/ui';
import {
    BalancerFormSchema,
    type BalancerFormValues
} from '@/schemas/xray';
import {
    BalancerStrategyTypeSchema,
    type BalancerStrategySettings,
    type BalancerStrategyType
} from '@/schemas/routing';

export type BalancerFormValue = BalancerFormValues;

interface BalancerFormModalProps {
  open: boolean;
  balancer: BalancerFormValue | null;
  outboundTags: string[];
  otherTags: string[];
  onClose: () => void;
  onConfirm: (value: BalancerFormValue) => void;
}

const STRATEGY_LABELS: Record<string, string> = {
    random: 'Random',
    roundRobin: 'Round robin',
    leastLoad: 'Least load',
    leastPing: 'Least ping'
};

const STRATEGIES = BalancerStrategyTypeSchema.options.map((value) => ({
    value,
    label: STRATEGY_LABELS[value] ?? value
}));

interface FormState {
  tag: string;
  strategy: BalancerStrategyType;
  selector: string[];
  fallbackTag: string;
  settings?: BalancerStrategySettings;
}

function initialState(balancer: BalancerFormValue | null): FormState
{
    if (!balancer)
    {
        return { tag: '', strategy: 'random', selector: [], fallbackTag: '' };
    }
    return {
        tag: balancer.tag ?? '',
        strategy: (balancer.strategy ?? 'random') as BalancerStrategyType,
        selector: [...(balancer.selector ?? [])],
        fallbackTag: balancer.fallbackTag ?? '',
        settings: balancer.settings
    };
}

// A labelled form field with optional error / warning message.
function Field({
    label,
    htmlFor,
    required,
    error,
    warning,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  warning?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : warning ? (
        <span className="text-xs text-warning">{warning}</span>
      ) : null}
    </div>
    );
}

// Free-form tag input: chips + a text box that commits on Enter or comma.
function TagInput({
    value,
    onChange,
    suggestions,
    invalid
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  invalid?: boolean;
})
{
    const [text, setText] = useState('');

    const add = (raw: string) =>
    {
        const v = raw.trim();
        if (!v || value.includes(v))
        {
            setText('');
            return;
        }
        onChange([...value, v]);
        setText('');
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) =>
    {
        if (e.key === 'Enter' || e.key === ',')
        {
            e.preventDefault();
            add(text);
        }
        else if (e.key === 'Backspace' && !text && value.length > 0)
        {
            onChange(value.slice(0, -1));
        }
    };

    const available = suggestions.filter((s) => !value.includes(s));

    return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
            'flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5',
            invalid ? 'border-danger' : 'border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35'
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-accent-subtle px-2 py-0.5 text-xs text-accent"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${ tag }`}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-accent/20"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(text)}
          className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
    );
}

export default function BalancerFormModal({
    open,
    balancer,
    outboundTags,
    otherTags,
    onClose,
    onConfirm
}: BalancerFormModalProps)
{
    const { t } = useTranslation();
    const [state, setState] = useState<FormState>(() => initialState(balancer));
    const isEdit = balancer != null;

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setState((prev) => ({ ...prev, [key]: value }));

    const parsed = useMemo(
        () => BalancerFormSchema.safeParse(state),
        [state]
    );
    const duplicateTag = !!state.tag.trim() && otherTags.includes(state.tag.trim());
    const issues = useMemo(() =>
    {
        const map: Record<string, string> = {};
        if (!parsed.success)
        {
            for (const issue of parsed.error.issues)
            {
                const key = String(issue.path[0] ?? '');
                if (!map[key])
                {
                    map[key] = t(issue.message, { defaultValue: issue.message });
                }
            }
        }
        return map;
    }, [parsed, t]);

    function submit()
    {
        if (!parsed.success || duplicateTag)
        {
            return;
        }
        const values = { ...parsed.data };
        if (values.strategy !== 'leastLoad')
        {
            delete values.settings;
        }
        onConfirm(values);
    }

    const settings = state.settings;
    const updateSetting = <K extends keyof BalancerStrategySettings>(
        key: K,
        value: BalancerStrategySettings[K]
    ) =>
    {
        setState((prev) => ({
            ...prev,
            settings: { ...(prev.settings ?? {}), [key]: value }
        }));
    };
    const updateBaselines = (next: string[]) => updateSetting('baselines', next);
    const updateCosts = (next: NonNullable<BalancerStrategySettings['costs']>) => updateSetting('costs', next);

    const baselines = settings?.baselines ?? [];
    const costs = settings?.costs ?? [];

    const fallbackOptions = useMemo(
        () => ['', ...outboundTags].map((tg) => ({ value: tg, label: tg || `(${ t('none') })` })),
        [outboundTags, t]
    );

    const title = isEdit
        ? `${ t('edit') } ${ t('pages.xray.Balancers') }`
        : `+ ${ t('pages.xray.Balancers') }`;
    const okText = isEdit ? t('pages.clients.submitEdit') : t('create');

    return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          <Button onClick={submit} disabled={!parsed.success || duplicateTag}>
            {okText}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t('pages.xray.balancer.tag')}
          htmlFor="bal-tag"
          required
          error={issues.tag}
          warning={duplicateTag ? t('pages.xray.balancer.tagDuplicate') : undefined}
        >
          <Input
            id="bal-tag"
            value={state.tag}
            onChange={(e) => update('tag', e.target.value)}
            placeholder={t('pages.xray.balancer.tagPlaceholder')}
            aria-invalid={!!issues.tag}
          />
        </Field>

        <Field label={t('pages.xray.balancer.balancerStrategy')} htmlFor="bal-strategy">
          <Select
            id="bal-strategy"
            value={state.strategy}
            onChange={(v) => update('strategy', v as BalancerStrategyType)}
            options={STRATEGIES}
          />
        </Field>

        <Field label={t('pages.xray.balancer.selector')} required error={issues.selector}>
          <TagInput
            value={state.selector}
            onChange={(v) => update('selector', v)}
            suggestions={outboundTags}
            invalid={!!issues.selector}
          />
        </Field>

        <Field label={t('pages.xray.balancer.fallback')} htmlFor="bal-fallback">
          <Select
            id="bal-fallback"
            value={state.fallbackTag}
            onChange={(v) => update('fallbackTag', v ?? '')}
            options={fallbackOptions}
          />
        </Field>

        {state.strategy === 'leastLoad' && (
          <>
            <Field label={t('pages.xray.balancer.expected')} htmlFor="bal-expected">
              <Input
                id="bal-expected"
                type="number"
                min={0}
                value={settings?.expected ?? ''}
                placeholder={t('pages.xray.balancer.expectedPlaceholder')}
                onChange={(e) => updateSetting('expected', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>
            <Field label={t('pages.xray.balancer.maxRtt')} htmlFor="bal-maxrtt">
              <Input
                id="bal-maxrtt"
                value={settings?.maxRTT ?? ''}
                onChange={(e) => updateSetting('maxRTT', e.target.value || undefined)}
                placeholder="e.g. 1s"
              />
            </Field>
            <Field label={t('pages.xray.balancer.tolerance')} htmlFor="bal-tolerance">
              <Input
                id="bal-tolerance"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={settings?.tolerance ?? ''}
                placeholder="0.01 = 1%"
                onChange={(e) => updateSetting('tolerance', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>

            <Field label={t('pages.xray.balancer.baselines')}>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  aria-label={t('add')}
                  onClick={() => updateBaselines([...baselines, ''])}
                  className="self-start"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
                {baselines.map((b, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={b}
                      placeholder="e.g. 1s"
                      onChange={(e) => updateBaselines(baselines.map((x, i) => (i === idx ? e.target.value : x)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('remove')}
                      onClick={() => updateBaselines(baselines.filter((_, i) => i !== idx))}
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </Field>

            <Field label={t('pages.xray.balancer.costs')}>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  aria-label={t('add')}
                  onClick={() => updateCosts([...costs, { regexp: false, match: '', value: 1 }])}
                  className="self-start"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
                {costs.map((c, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={c.regexp}
                        onCheckedChange={(v) => updateCosts(costs.map((x, i) => (i === idx ? { ...x, regexp: v } : x)))}
                      />
                      {c.regexp ? 're' : 'lit'}
                    </label>
                    <Input
                      className="flex-1"
                      value={c.match}
                      placeholder="tag pattern"
                      onChange={(e) => updateCosts(costs.map((x, i) => (i === idx ? { ...x, match: e.target.value } : x)))}
                    />
                    <Input
                      type="number"
                      className="w-24"
                      value={c.value}
                      placeholder="weight"
                      onChange={(e) => updateCosts(costs.map((x, i) => (i === idx ? { ...x, value: e.target.value === '' ? 0 : Number(e.target.value) } : x)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('remove')}
                      onClick={() => updateCosts(costs.filter((_, i) => i !== idx))}
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>
    </Modal>
    );
}
