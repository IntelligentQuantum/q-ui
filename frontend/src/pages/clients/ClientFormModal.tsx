import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/ui/message';
import { Check, ChevronDown, Eye, RefreshCw, X } from 'lucide-react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

import { HttpUtil, RandomUtil } from '@/utils';
import { useMe } from '@/hooks/useMe';
import { useCurrency } from '@/hooks/useCurrency';
import { DateTimePicker } from '@/components/form';
import { TLS_FLOW_CONTROL } from '@/schemas/primitives';
import type { ClientRecord, InboundOption } from '@/hooks/useClients';
import { ClientFormSchema, ClientCreateFormSchema } from '@/schemas/client';
import {
    Alert,
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
const VMESS_SECURITY_OPTIONS = ['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none', 'zero'] as const;

const MULTI_CLIENT_PROTOCOLS = new Set([
    'shadowsocks', 'vless', 'vmess', 'trojan', 'hysteria'
]);

interface ApiMsg<T = unknown> {
  success?: boolean;
  obj?: T;
}

type Mode = 'add' | 'edit';

interface SaveMetaEdit {
  isEdit: true;
  email: string;
  attach: number[];
  detach: number[];
}

interface SaveMetaCreate {
  isEdit: false;
}

interface SaveCreatePayload {
  client: Record<string, unknown>;
  inboundIds: number[];
}

interface ClientFormModalProps {
  open: boolean;
  mode: Mode;
  client: ClientRecord | null;
  inbounds: InboundOption[];
  attachedIds?: number[];
  ipLimitEnable?: boolean;
  tgBotEnable?: boolean;
  groups?: string[];
  save: (
    payload: Record<string, unknown> | SaveCreatePayload,
    meta: SaveMetaEdit | SaveMetaCreate,
  ) => Promise<ApiMsg | null>;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  email: string;
  subId: string;
  uuid: string;
  password: string;
  auth: string;
  flow: string;
  security: string;
  reverseTag: string;
  totalGB: number;
  expiryDate: Dayjs | null;
  delayedStart: boolean;
  delayedDays: number;
  reset: number;
  limitIp: number;
  tgId: number;
  group: string;
  comment: string;
  enable: boolean;
  inboundIds: number[];
}

function emptyForm(): FormState
{
    return {
        email: '',
        subId: '',
        uuid: '',
        password: '',
        auth: '',
        flow: '',
        security: 'auto',
        reverseTag: '',
        totalGB: 0,
        expiryDate: null,
        delayedStart: false,
        delayedDays: 0,
        reset: 0,
        limitIp: 0,
        tgId: 0,
        group: '',
        comment: '',
        enable: true,
        inboundIds: []
    };
}

function bytesToGB(bytes: number): number
{
    if (!bytes || bytes <= 0)
    {
        return 0;
    }
    return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
}

function gbToBytes(gb: number): number
{
    if (!gb || gb <= 0)
    {
        return 0;
    }
    return Math.round(gb * 1024 * 1024 * 1024);
}

// One labelled form field with optional required marker + hint tooltip.
function Field({
    label,
    htmlFor,
    required,
    tooltip,
    children,
    className
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  tooltip?: ReactNode;
  children: ReactNode;
  className?: string;
})
{
    return (
    <div className={cn('flex flex-col gap-1.5', className)}>
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

// A text input paired with a "regenerate" action button.
function RegenInput({
    id,
    value,
    placeholder,
    regenLabel,
    onChange,
    onRegen
}: {
  id?: string;
  value: string;
  placeholder?: string;
  regenLabel: string;
  onChange: (v: string) => void;
  onRegen: () => void;
})
{
    return (
    <div className="flex items-stretch gap-2">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1"
      />
      <Button variant="secondary" size="icon" aria-label={regenLabel} onClick={onRegen}>
        <RefreshCw className="h-4 w-4" aria-hidden />
      </Button>
    </div>
    );
}

// Controlled numeric input. Empty/invalid resolves to 0, matching the prior
// AntD InputNumber `Number(v) || fallback` behavior.
function NumberInput({
    id,
    value,
    min = 0,
    step,
    placeholder,
    onChange
}: {
  id?: string;
  value: number;
  min?: number;
  step?: number;
  placeholder?: string;
  onChange: (v: number) => void;
})
{
    return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      step={step}
      placeholder={placeholder}
      onChange={(e) =>
      {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
      }}
    />
    );
}

// Multi-select for attached inbounds: a trigger showing chips, opening a
// searchable checkbox list. Token-only, RTL-safe.
function InboundMultiSelect({
    value,
    options,
    placeholder,
    searchPlaceholder,
    ariaInvalid,
    onChange
}: {
  value: number[];
  options: { value: number; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  ariaInvalid?: boolean;
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
        aria-invalid={ariaInvalid}
        onClick={() => setOpen((o) => !o)}
        className={cn(
            'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-start text-sm text-foreground',
            'outline-none transition-[color,border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
            open && 'border-ring ring-2 ring-ring/35',
            ariaInvalid && 'border-danger'
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
        <div className="absolute bottom-full z-[var(--z-dropdown)] mb-1.5 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg motion-safe:animate-[fade-in_120ms_ease-out]">
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

export default function ClientFormModal({
    open,
    mode,
    client,
    inbounds,
    attachedIds = [],
    ipLimitEnable = false,
    tgBotEnable = false,
    groups = [],
    save,
    onOpenChange
}: ClientFormModalProps)
{
    const { t } = useTranslation();
    const [messageApi] = message.useMessage();
    const { me } = useMe();
    // The Clients page is admin + moderator only. Managers (moderators) get a
    // simplified form: the advanced fields below (UUID, reverse tag, group, …) are
    // hidden and the "Email" label reads "Name". The backend independently ignores
    // these fields for every non-admin, so hiding them is purely a UX simplification.
    const restricted = !!me && !me.isAdmin;
    const { format: formatMoney } = useCurrency();
    const isEdit = mode === 'edit';
    const groupListId = useId();

    const [form, setForm] = useState<FormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [clientIps, setClientIps] = useState<string[]>([]);
    const [ipsLoading, setIpsLoading] = useState(false);
    const [ipsClearing, setIpsClearing] = useState(false);
    const [ipsModalOpen, setIpsModalOpen] = useState(false);

    function update<K extends keyof FormState>(key: K, value: FormState[K])
    {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        setIpsModalOpen(false);

        if (isEdit && client)
        {
            const et = Number(client.expiryTime) || 0;
            const next: FormState = {
                ...emptyForm(),
                email: client.email || '',
                subId: client.subId || '',
                uuid: client.uuid || '',
                password: client.password || '',
                auth: client.auth || '',
                flow: client.flow || '',
                security: client.security || 'auto',
                reverseTag: client.reverse?.tag || '',
                totalGB: bytesToGB(client.totalGB || 0),
                reset: Number(client.reset) || 0,
                limitIp: client.limitIp || 0,
                tgId: Number(client.tgId) || 0,
                group: client.group || '',
                comment: client.comment || '',
                enable: !!client.enable,
                inboundIds: Array.isArray(attachedIds) ? [...attachedIds] : []
            };
            if (et < 0)
            {
                next.delayedStart = true;
                next.delayedDays = Math.round(et / -86400000);
                next.expiryDate = null;
            }
            else
            {
                next.delayedStart = false;
                next.delayedDays = 0;
                next.expiryDate = et > 0 ? dayjs(et) : null;
            }
            setForm(next);
            void loadIps();
        }
        else
        {
            setForm({
                ...emptyForm(),
                email: RandomUtil.randomLowerAndNum(10),
                uuid: RandomUtil.randomUUID(),
                subId: RandomUtil.randomLowerAndNum(16),
                password: RandomUtil.randomLowerAndNum(16),
                auth: RandomUtil.randomLowerAndNum(16)
            });
        }

    }, [open, isEdit]);

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

    const vlessLikeIds = useMemo(() =>
    {
        const ids = new Set<number>();
        for (const row of inbounds || [])
        {
            if (row && row.protocol === 'vless')
            {
                ids.add(row.id);
            }
        }
        return ids;
    }, [inbounds]);

    const vmessIds = useMemo(() =>
    {
        const ids = new Set<number>();
        for (const row of inbounds || [])
        {
            if (row && row.protocol === 'vmess')
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

    const showReverseTag = useMemo(
        () => !restricted && (form.inboundIds || []).some((id) => vlessLikeIds.has(id)),
        [form.inboundIds, vlessLikeIds, restricted]
    );

    const showSecurity = useMemo(
        () => (form.inboundIds || []).some((id) => vmessIds.has(id)),
        [form.inboundIds, vmessIds]
    );

    useEffect(() =>
    {
        if (!showFlow && form.flow)
        {

            update('flow', '');
        }
    }, [showFlow, form.flow]);

    useEffect(() =>
    {
        if (!showReverseTag && form.reverseTag)
        {

            update('reverseTag', '');
        }
    }, [showReverseTag, form.reverseTag]);

    const inboundOptions = useMemo(
        () => (inbounds || [])
            .filter((ib) => MULTI_CLIENT_PROTOCOLS.has(ib.protocol || ''))
            .map((ib) => ({
                label: ib.remark?.trim() || ib.tag || '',
                value: ib.id
            })),
        [inbounds]
    );

    async function loadIps()
    {
        if (!isEdit || !client?.email)
        {
            return;
        }
        setIpsLoading(true);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/clients/ips/${ encodeURIComponent(client.email) }`) as ApiMsg<unknown[]>;
            if (!msg?.success)
            {
                setClientIps([]); return;
            }
            const arr = Array.isArray(msg.obj) ? msg.obj : [];
            setClientIps(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
        }
        finally
        {
            setIpsLoading(false);
        }
    }

    function openIpsModal()
    {
        setIpsModalOpen(true);
        if (clientIps.length === 0)
        {
            void loadIps();
        }
    }

    async function clearIps()
    {
        if (!isEdit || !client?.email)
        {
            return;
        }
        setIpsClearing(true);
        try
        {
            const msg = await HttpUtil.post(`/panel/api/clients/clearIps/${ encodeURIComponent(client.email) }`) as ApiMsg;
            if (msg?.success)
            {
                setClientIps([]);
            }
        }
        finally
        {
            setIpsClearing(false);
        }
    }

    function close()
    {
        onOpenChange(false);
    }

    async function onSubmit()
    {
        const schema = isEdit ? ClientFormSchema : ClientCreateFormSchema;
        const validated = schema.safeParse({
            email: form.email,
            subId: form.subId,
            uuid: form.uuid,
            password: form.password,
            auth: form.auth,
            flow: form.flow,
            security: form.security,
            reverseTag: form.reverseTag,
            totalGB: form.totalGB,
            delayedStart: form.delayedStart,
            delayedDays: form.delayedDays,
            reset: form.reset,
            limitIp: form.limitIp,
            tgId: form.tgId,
            group: form.group,
            comment: form.comment,
            enable: form.enable,
            inboundIds: form.inboundIds
        });
        if (!validated.success)
        {
            const issue = validated.error.issues[0];
            messageApi.error(t(issue?.message ?? 'somethingWentWrong'));
            return;
        }
        const expiryTime = form.delayedStart
            ? -86400000 * (Number(form.delayedDays) || 0)
            : (form.expiryDate ? form.expiryDate.valueOf() : 0);
        const clientPayload: Record<string, unknown> = {
            email: form.email.trim(),
            subId: form.subId,
            id: form.uuid,
            password: form.password,
            auth: form.auth,
            flow: showFlow ? (form.flow || '') : '',
            security: showSecurity ? (form.security || 'auto') : 'auto',
            totalGB: gbToBytes(form.totalGB),
            expiryTime,
            reset: Number(form.reset) || 0,
            limitIp: Number(form.limitIp) || 0,
            tgId: Number(form.tgId) || 0,
            group: form.group,
            comment: form.comment,
            enable: !!form.enable
        };
        const reverseTag = showReverseTag ? (form.reverseTag || '').trim() : '';
        if (reverseTag)
        {
            clientPayload.reverse = { tag: reverseTag };
        }

        setSubmitting(true);
        try
        {
            let msg;
            if (isEdit && client)
            {
                const original = new Set(attachedIds || []);
                const next = new Set(form.inboundIds || []);
                const toAttach = [...next].filter((id) => !original.has(id));
                const toDetach = [...original].filter((id) => !next.has(id));
                msg = await save(clientPayload, {
                    isEdit: true,
                    email: client.email,
                    attach: toAttach,
                    detach: toDetach
                });
            }
            else
            {
                msg = await save(
                    { client: clientPayload, inboundIds: form.inboundIds },
                    { isEdit: false }
                );
            }
            if (msg?.success)
            {
                close();
            }
        }
        finally
        {
            setSubmitting(false);
        }
    }

    // Cost preview: only meaningful for a non-admin creating a client when a
    // price is configured. form.totalGB here is in GB (converted to bytes on
    // submit), matching the per-GB rate. Mirrors web/service/cost.go.
    const costPreview = (() =>
    {
        if (isEdit || !me || me.isAdmin)
        {
            return null;
        }
        const base = me.clientCost || 0;
        const perGB = me.clientCostPerGB || 0;
        if (base <= 0 && perGB <= 0)
        {
            return null;
        }
        const cost = base + (perGB > 0 && form.totalGB > 0 ? Math.round(form.totalGB * perGB) : 0);
        const after = (me.balance || 0) - cost;
        return { cost, after, insufficient: after < 0 };
    })();

    return (
    <>
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={isEdit ? t('pages.clients.editClient') : t('pages.clients.addClient')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>{t('cancel')}</Button>
            <Button variant="primary" loading={submitting} onClick={onSubmit}>
              {isEdit ? t('save') : t('create')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {costPreview && (
            <Alert
              variant={costPreview.insufficient ? 'danger' : 'info'}
              title={t('pages.clients.costPreview', {
                  cost: formatMoney(costPreview.cost),
                  after: formatMoney(costPreview.after)
              })}
            >
              {costPreview.insufficient ? t('pages.clients.costInsufficient') : undefined}
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label={restricted ? t('pages.clients.name') : t('pages.clients.email')}
              htmlFor="cf-email"
              required
              className={restricted ? 'md:col-span-2' : undefined}
            >
              <RegenInput
                id="cf-email"
                value={form.email}
                placeholder={restricted ? t('pages.clients.name') : t('pages.clients.email')}
                regenLabel={t('regenerate')}
                onChange={(v) => update('email', v)}
                onRegen={() => update('email', RandomUtil.randomLowerAndNum(12))}
              />
            </Field>
            {!restricted && (
              <Field label={t('pages.clients.subId')} htmlFor="cf-subid">
                <RegenInput
                  id="cf-subid"
                  value={form.subId}
                  regenLabel={t('regenerate')}
                  onChange={(v) => update('subId', v)}
                  onRegen={() => update('subId', RandomUtil.randomLowerAndNum(16))}
                />
              </Field>
            )}
          </div>

          {!restricted && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('pages.clients.hysteriaAuth')} htmlFor="cf-auth">
              <RegenInput
                id="cf-auth"
                value={form.auth}
                regenLabel={t('regenerate')}
                onChange={(v) => update('auth', v)}
                onRegen={() => update('auth', RandomUtil.randomLowerAndNum(16))}
              />
            </Field>
            <Field label={t('pages.clients.password')} htmlFor="cf-password">
              <RegenInput
                id="cf-password"
                value={form.password}
                regenLabel={t('regenerate')}
                onChange={(v) => update('password', v)}
                onRegen={() => update('password', RandomUtil.randomLowerAndNum(16))}
              />
            </Field>
          </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!restricted && (
              <Field label={t('pages.clients.uuid')} htmlFor="cf-uuid">
                <RegenInput
                  id="cf-uuid"
                  value={form.uuid}
                  regenLabel={t('regenerate')}
                  onChange={(v) => update('uuid', v)}
                  onRegen={() => update('uuid', RandomUtil.randomUUID())}
                />
              </Field>
            )}
            <div className={cn('grid gap-4', ipLimitEnable ? 'grid-cols-2' : 'grid-cols-1')}>
              <Field label={t('pages.clients.totalGB')} htmlFor="cf-totalgb">
                <NumberInput id="cf-totalgb" value={form.totalGB} min={0} step={1} onChange={(v) => update('totalGB', v)} />
              </Field>
              {ipLimitEnable && (
                <Field label={t('pages.clients.limitIp')} htmlFor="cf-limitip">
                  <NumberInput id="cf-limitip" value={form.limitIp} min={0} onChange={(v) => update('limitIp', v)} />
                </Field>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {form.delayedStart ? (
              <Field label={t('pages.clients.expireDays')} htmlFor="cf-delayeddays">
                <NumberInput id="cf-delayeddays" value={form.delayedDays} min={0} onChange={(v) => update('delayedDays', v)} />
              </Field>
            ) : (
              <Field label={t('pages.clients.expiryTime')}>
                <DateTimePicker
                  value={form.expiryDate}
                  onChange={(d) => update('expiryDate', d || null)}
                />
              </Field>
            )}
            <Field label={t('pages.clients.delayedStart')}>
              <div className="flex h-9 items-center">
                <Switch
                  checked={form.delayedStart}
                  onCheckedChange={(v) =>
                  {
                      update('delayedStart', v);
                      if (v)
                      {
                          update('expiryDate', null);
                      }
                      else
                      {
                          update('delayedDays', 0);
                      }
                  }}
                  aria-label={t('pages.clients.delayedStart')}
                />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!restricted && (
              <Field label={t('pages.clients.renew')} htmlFor="cf-reset" tooltip={t('pages.clients.renewDesc')}>
                <NumberInput id="cf-reset" value={form.reset} min={0} onChange={(v) => update('reset', v)} />
              </Field>
            )}
            {showReverseTag && (
              <Field label={t('pages.clients.reverseTag')} htmlFor="cf-reversetag">
                <Input
                  id="cf-reversetag"
                  value={form.reverseTag}
                  placeholder={t('pages.clients.reverseTagPlaceholder')}
                  onChange={(e) => update('reverseTag', e.target.value)}
                />
              </Field>
            )}
            {showFlow && (
              <Field label={t('pages.clients.flow')}>
                <Select
                  value={form.flow}
                  onChange={(v) => update('flow', v)}
                  options={[
                      { value: '', label: t('none') },
                      ...FLOW_OPTIONS.map((k) => ({ value: k, label: k }))
                  ]}
                />
              </Field>
            )}
            {showSecurity && (
              <Field label={t('pages.clients.vmessSecurity')}>
                <Select
                  value={form.security}
                  onChange={(v) => update('security', v)}
                  options={VMESS_SECURITY_OPTIONS.map((k) => ({ value: k, label: k }))}
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tgBotEnable && (
              <Field label={t('pages.clients.telegramId')} htmlFor="cf-tgid">
                <NumberInput
                  id="cf-tgid"
                  value={form.tgId}
                  min={0}
                  placeholder={t('pages.clients.telegramIdPlaceholder')}
                  onChange={(v) => update('tgId', v)}
                />
              </Field>
            )}
            {!restricted && (
              <Field label={t('pages.clients.comment')} htmlFor="cf-comment" className={tgBotEnable ? undefined : 'md:col-span-2'}>
                <Input id="cf-comment" value={form.comment} onChange={(e) => update('comment', e.target.value)} />
              </Field>
            )}
            {!restricted && (
              <Field label={t('pages.clients.group')} htmlFor="cf-group" tooltip={t('pages.clients.groupDesc')}>
                <Input
                  id="cf-group"
                  list={groupListId}
                  value={form.group}
                  placeholder={t('pages.clients.groupPlaceholder')}
                  onChange={(e) => update('group', e.target.value)}
                />
                <datalist id={groupListId}>
                  {groups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </Field>
            )}
          </div>

          <Field label={t('pages.clients.attachedInbounds')} required={!isEdit}>
            <InboundMultiSelect
              value={form.inboundIds}
              options={inboundOptions}
              placeholder={t('pages.clients.selectInbound')}
              searchPlaceholder={t('pages.clients.selectInbound')}
              onChange={(v) => update('inboundIds', v)}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Switch checked={form.enable} onCheckedChange={(v) => update('enable', v)} aria-label={t('enable')} />
            <span className="text-sm text-foreground">{t('enable')}</span>
          </div>

          {isEdit && ipLimitEnable && (
            <Field label={t('pages.clients.ipLog')}>
              <Button variant="secondary" loading={ipsLoading} onClick={openIpsModal} className="w-fit">
                <Eye className="h-4 w-4" aria-hidden />
                {clientIps.length > 0 ? clientIps.length : ''}
              </Button>
            </Field>
          )}
        </div>
      </Modal>

      <Modal
        open={ipsModalOpen}
        onClose={() => setIpsModalOpen(false)}
        size="sm"
        title={`${ t('pages.clients.ipLog') }${ client?.email ? ` — ${ client.email }` : '' }`}
        footer={
          <>
            <Button variant="secondary" loading={ipsLoading} onClick={loadIps}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('refresh')}
            </Button>
            <Button variant="danger" loading={ipsClearing} disabled={clientIps.length === 0} onClick={clearIps}>
              {t('pages.clients.clearAll')}
            </Button>
            <Button variant="primary" onClick={() => setIpsModalOpen(false)}>
              {t('close')}
            </Button>
          </>
        }
      >
        {clientIps.length > 0 ? (
          <div className="flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
            {clientIps.map((ip, idx) => (
              <span
                key={idx}
                className="w-fit max-w-full rounded-md bg-accent-subtle px-2 py-0.5 font-mono text-xs text-accent"
              >
                {ip}
              </span>
            ))}
          </div>
        ) : (
          <span className="inline-flex rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-muted-foreground">
            {t('tgbot.noIpRecord')}
          </span>
        )}
      </Modal>
    </>
    );
}
