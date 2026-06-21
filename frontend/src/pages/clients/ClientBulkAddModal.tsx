import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { Check, ChevronDown, RefreshCw, X } from 'lucide-react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

import { RandomUtil, SizeFormatter } from '@/utils';
import { TLS_FLOW_CONTROL } from '@/schemas/primitives';
import { DateTimePicker } from '@/components/form';
import { useClients, type InboundOption } from '@/hooks/useClients';
import { ClientBulkAddFormSchema, type ClientBulkAddFormValues } from '@/schemas/client';
import {
    Badge,
    Button,
    Input,
    Label,
    Modal,
    Select,
    Switch,
    Tooltip,
    cn
} from '@/components/ui';

const FLOW_OPTIONS = Object.values(TLS_FLOW_CONTROL);

const MULTI_CLIENT_PROTOCOLS = new Set([
    'shadowsocks', 'vless', 'vmess', 'trojan', 'hysteria'
]);

interface ClientBulkAddModalProps {
  open: boolean;
  inbounds: InboundOption[];
  ipLimitEnable?: boolean;
  groups?: string[];
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type FormState = ClientBulkAddFormValues;

function emptyForm(): FormState
{
    return {
        emailMethod: 0,
        firstNum: 1,
        lastNum: 1,
        emailPrefix: '',
        emailPostfix: '',
        quantity: 1,
        subId: '',
        group: '',
        comment: '',
        flow: '',
        limitIp: 0,
        totalGB: 0,
        expiryTime: 0,
        reset: 0,
        inboundIds: []
    };
}

// One labelled field with optional required marker + hint tooltip.
function Field({
    label,
    htmlFor,
    required,
    tooltip,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  tooltip?: ReactNode;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required && <span className="text-danger">*</span>}
        {tooltip && (
          <Tooltip content={tooltip}>
            <span className="cursor-help text-muted-foreground">?</span>
          </Tooltip>
        )}
      </Label>
      {children}
    </div>
    );
}

// Controlled numeric input. Empty/invalid resolves to `fallback`, mirroring the
// prior AntD InputNumber `Number(v) || fallback` behavior.
function NumberInput({
    id,
    value,
    min,
    max,
    step,
    fallback = 0,
    onChange
}: {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  fallback?: number;
  onChange: (v: number) => void;
})
{
    return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : fallback}
      min={min}
      max={max}
      step={step}
      onChange={(e) =>
      {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && e.target.value !== '' ? n : fallback);
      }}
    />
    );
}

// Multi-select for attached inbounds: trigger with chips, searchable checkbox
// list. Token-only, RTL-safe.
function InboundMultiSelect({
    value,
    options,
    placeholder,
    searchPlaceholder,
    onChange
}: {
  value: number[];
  options: { value: number; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (next: number[]) => void;
})
{
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        const onDoc = (e: MouseEvent) =>
        {
            if (!rootRef.current?.contains(e.target as Node))
            {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const labelById = useMemo(() =>
    {
        const m = new Map<number, string>();
        for (const o of options)
        {
            m.set(o.value, o.label);
        }
        return m;
    }, [options]);

    const filtered = useMemo(() =>
    {
        const q = query.toLowerCase();
        if (!q)
        {
            return options;
        }
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, query]);

    function toggle(id: number)
    {
        if (value.includes(id))
        {
            onChange(value.filter((x) => x !== id));
        }
        else
        {
            onChange([...value, id]);
        }
    }

    return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
            'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-start text-sm text-foreground',
            'outline-none transition-[color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
            open && 'border-ring ring-2 ring-ring/35'
        )}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="flex flex-1 flex-wrap gap-1">
            {value.map((id) => (
              <Badge key={id} variant="neutral" className="gap-1">
                <span className="max-w-[140px] truncate">{labelById.get(id) ?? id}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="remove"
                  className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-foreground/10"
                  onClick={(e) =>
                  {
                      e.stopPropagation(); toggle(id);
                  }}
                >
                  <X className="h-3 w-3" aria-hidden />
                </span>
              </Badge>
            ))}
          </span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute z-[var(--z-dropdown)] mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg motion-safe:animate-[fade-in_120ms_ease-out]">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul role="listbox" className="max-h-[220px] overflow-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">—</li>
            ) : (
                filtered.map((opt) =>
                {
                    const checked = value.includes(opt.value);
                    return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground',
                        'hover:bg-foreground/[0.06]'
                    )}
                  >
                    <span
                      className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded-[0.3rem] border',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-transparent'
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </li>
                    );
                })
            )}
          </ul>
        </div>
      )}
    </div>
    );
}

const METHOD_OPTIONS = [
    { value: 0, label: 'Random' },
    { value: 1, label: 'Random + Prefix' },
    { value: 2, label: 'Random + Prefix + Num' },
    { value: 3, label: 'Random + Prefix + Num + Postfix' },
    { value: 4, label: 'Prefix + Num + Postfix' }
] as const;

export default function ClientBulkAddModal({
    open,
    inbounds,
    ipLimitEnable = false,
    groups = [],
    onOpenChange,
    onSaved
}: ClientBulkAddModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const { bulkCreate } = useClients();
    const groupListId = useId();

    const [form, setForm] = useState<FormState>(emptyForm);
    const [delayedStart, setDelayedStart] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }

        setForm(emptyForm());
        setDelayedStart(false);

    }, [open]);

    function update<K extends keyof FormState>(key: K, value: FormState[K])
    {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    const flowCapableIds = useMemo(() =>
    {
        const ids = new Set<number>();
        for (const row of inbounds || [])
        {
            if (row?.tlsFlowCapable)
            {
                ids.add(row.id);
            }
        }
        return ids;
    }, [inbounds]);

    const showFlow = useMemo(
        () => (form.inboundIds || []).some((id) => flowCapableIds.has(id)),
        [form.inboundIds, flowCapableIds]
    );

    useEffect(() =>
    {
        if (!showFlow && form.flow)
        {

            update('flow', '');
        }
    }, [showFlow, form.flow]);

    const inboundOptions = useMemo(
        () => (inbounds || [])
            .filter((ib) => MULTI_CLIENT_PROTOCOLS.has(ib.protocol || ''))
            .map((ib) => ({
                label: ib.remark?.trim() || ib.tag || '',
                value: ib.id
            })),
        [inbounds]
    );

    const expiryDate = useMemo<Dayjs | null>(
        () => (form.expiryTime > 0 ? dayjs(form.expiryTime) : null),
        [form.expiryTime]
    );

    const delayedExpireDays = form.expiryTime < 0 ? form.expiryTime / -86400000 : 0;

    function buildEmails(): string[]
    {
        const method = form.emailMethod;
        const out: string[] = [];
        let start: number;
        let end: number;
        if (method > 1)
        {
            start = form.firstNum;
            end = form.lastNum + 1;
        }
        else
        {
            start = 0;
            end = form.quantity;
        }
        const prefix = method > 0 && form.emailPrefix.length > 0 ? form.emailPrefix : '';
        const useNum = method > 1;
        const postfix = method > 2 && form.emailPostfix.length > 0 ? form.emailPostfix : '';
        for (let i = start; i < end; i++)
        {
            let email = '';
            if (method !== 4)
            {
                email = RandomUtil.randomLowerAndNum(10);
            }
            email += useNum ? prefix + String(i) + postfix : prefix + postfix;
            out.push(email);
        }
        return out;
    }

    async function submit()
    {
        const validated = ClientBulkAddFormSchema.safeParse(form);
        if (!validated.success)
        {
            messageApi.error(t(validated.error.issues[0]?.message ?? 'somethingWentWrong'));
            return;
        }
        const emails = buildEmails();
        if (emails.length === 0)
        {
            return;
        }

        setSaving(true);
        try
        {
            const payloads = emails.map((email) => ({
                client: {
                    email,
                    subId: form.subId || RandomUtil.randomLowerAndNum(16),
                    id: RandomUtil.randomUUID(),
                    password: RandomUtil.randomLowerAndNum(16),
                    auth: RandomUtil.randomLowerAndNum(16),
                    flow: showFlow ? (form.flow || '') : '',
                    totalGB: Math.round((form.totalGB || 0) * SizeFormatter.ONE_GB),
                    expiryTime: form.expiryTime,
                    reset: Number(form.reset) || 0,
                    limitIp: Number(form.limitIp) || 0,
                    group: form.group,
                    comment: form.comment,
                    enable: true
                },
                inboundIds: form.inboundIds
            }));
            const msg = await bulkCreate(payloads);
            const ok = msg?.obj?.created ?? 0;
            const skipped = msg?.obj?.skipped ?? [];
            const failed = skipped.length;
            const firstError = skipped[0]?.reason ?? msg?.msg ?? '';
            if (failed === 0 && msg?.success)
            {
                messageApi.success(t('pages.clients.toasts.bulkCreated', { count: ok }));
            }
            else
            {
                messageApi.warning(firstError
                    ? `${ t('pages.clients.toasts.bulkCreatedMixed', { ok, failed }) } — ${ firstError }`
                    : t('pages.clients.toasts.bulkCreatedMixed', { ok, failed }));
            }
            onSaved?.();
            onOpenChange(false);
        }
        finally
        {
            setSaving(false);
        }
    }

    return (
    <>
      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        closeOnOverlay={false}
        size="lg"
        title={t('pages.clients.bulk')}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('close')}</Button>
            <Button variant="primary" loading={saving} onClick={submit}>{t('create')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('pages.clients.attachedInbounds')} required>
            <InboundMultiSelect
              value={form.inboundIds}
              options={inboundOptions}
              placeholder={t('pages.clients.selectInbound')}
              searchPlaceholder={t('pages.clients.selectInbound')}
              onChange={(v) => update('inboundIds', v)}
            />
          </Field>

          <Field label={t('pages.clients.method')}>
            <Select
              value={String(form.emailMethod)}
              onChange={(v) => update('emailMethod', Number(v))}
              options={METHOD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            />
          </Field>

          {form.emailMethod > 1 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('pages.clients.first')} htmlFor="bulk-first">
                <NumberInput id="bulk-first" value={form.firstNum} min={1} fallback={1} onChange={(v) => update('firstNum', v)} />
              </Field>
              <Field label={t('pages.clients.last')} htmlFor="bulk-last">
                <NumberInput id="bulk-last" value={form.lastNum} min={form.firstNum} fallback={1} onChange={(v) => update('lastNum', v)} />
              </Field>
            </div>
          )}
          {form.emailMethod > 0 && (
            <Field label={t('pages.clients.prefix')} htmlFor="bulk-prefix">
              <Input id="bulk-prefix" value={form.emailPrefix} onChange={(e) => update('emailPrefix', e.target.value)} />
            </Field>
          )}
          {form.emailMethod > 2 && (
            <Field label={t('pages.clients.postfix')} htmlFor="bulk-postfix">
              <Input id="bulk-postfix" value={form.emailPostfix} onChange={(e) => update('emailPostfix', e.target.value)} />
            </Field>
          )}
          {form.emailMethod < 2 && (
            <Field label={t('pages.clients.clientCount')} htmlFor="bulk-quantity">
              <NumberInput id="bulk-quantity" value={form.quantity} min={1} max={1000} fallback={1} onChange={(v) => update('quantity', v)} />
            </Field>
          )}

          <Field label={t('pages.clients.subId')} htmlFor="bulk-subid">
            <div className="flex items-stretch gap-2">
              <Input
                id="bulk-subid"
                value={form.subId}
                onChange={(e) => update('subId', e.target.value)}
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label={t('regenerate')}
                onClick={() => update('subId', RandomUtil.randomLowerAndNum(16))}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </Field>

          <Field label={t('pages.clients.group')} htmlFor="bulk-group" tooltip={t('pages.clients.groupDesc')}>
            <Input
              id="bulk-group"
              list={groupListId}
              value={form.group}
              placeholder={t('pages.clients.groupPlaceholder')}
              onChange={(e) => update('group', e.target.value)}
            />
            <datalist id={groupListId}>
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
          </Field>

          <Field label={t('comment')} htmlFor="bulk-comment">
            <Input id="bulk-comment" value={form.comment} onChange={(e) => update('comment', e.target.value)} />
          </Field>

          {showFlow && (
            <Field label={t('pages.clients.flow')}>
              <Select
                value={form.flow}
                onChange={(v) => update('flow', v)}
                className="sm:max-w-[220px]"
                options={[
                    { value: '', label: t('none') },
                    ...FLOW_OPTIONS.map((k) => ({ value: k, label: k }))
                ]}
              />
            </Field>
          )}

          {ipLimitEnable && (
            <Field label={t('pages.clients.limitIp')} htmlFor="bulk-limitip">
              <NumberInput id="bulk-limitip" value={form.limitIp} min={0} onChange={(v) => update('limitIp', v)} />
            </Field>
          )}

          <Field label={t('pages.clients.totalGB')} htmlFor="bulk-totalgb">
            <NumberInput id="bulk-totalgb" value={form.totalGB} min={0} step={1} onChange={(v) => update('totalGB', v)} />
          </Field>

          <Field label={t('pages.clients.delayedStart')}>
            <div className="flex h-9 items-center">
              <Switch
                checked={delayedStart}
                onCheckedChange={() =>
                {
                    setDelayedStart(!delayedStart); update('expiryTime', 0);
                }}
                aria-label={t('pages.clients.delayedStart')}
              />
            </div>
          </Field>

          {delayedStart ? (
            <Field label={t('pages.clients.expireDays')} htmlFor="bulk-expiredays">
              <NumberInput
                id="bulk-expiredays"
                value={delayedExpireDays}
                min={0}
                onChange={(v) => update('expiryTime', -86400000 * (Number(v) || 0))}
              />
            </Field>
          ) : (
            <Field label={t('pages.inbounds.expireDate')}>
              <DateTimePicker
                value={expiryDate}
                onChange={(next) => update('expiryTime', next ? next.valueOf() : 0)}
              />
            </Field>
          )}

          <Field label={t('pages.clients.renew')} htmlFor="bulk-reset" tooltip={t('pages.clients.renewDesc')}>
            <NumberInput id="bulk-reset" value={form.reset} min={0} onChange={(v) => update('reset', v)} />
          </Field>
        </div>
      </Modal>
    </>
    );
}
