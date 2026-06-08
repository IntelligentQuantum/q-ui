import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, CircleHelp } from 'lucide-react';

import { Button, Input, Label, Modal, Select, Tooltip, cn } from '@/components/ui';
import { useInboundOptions } from '@/api/queries/useInboundOptions';
import { RuleFormSchema, type RuleFormValues } from '@/schemas/xray';

export interface RoutingRule {
  type?: string;
  domain?: string | string[];
  ip?: string | string[];
  port?: string;
  sourcePort?: string;
  vlessRoute?: string;
  network?: string;
  sourceIP?: string | string[];
  user?: string | string[];
  inboundTag?: string[];
  protocol?: string[];
  attrs?: Record<string, string>;
  outboundTag?: string;
  balancerTag?: string;
  [key: string]: unknown;
}

interface RuleFormModalProps {
  open: boolean;
  rule: RoutingRule | null;
  inboundTags: string[];
  outboundTags: string[];
  balancerTags: string[];
  onClose: () => void;
  onConfirm: (rule: Record<string, unknown>) => void;
}

type FormState = RuleFormValues;

const initialForm = (): FormState => ({
    domain: '',
    ip: '',
    port: '',
    sourcePort: '',
    vlessRoute: '',
    network: '',
    sourceIP: '',
    user: '',
    inboundTag: [],
    protocol: [],
    attrs: [],
    outboundTag: '',
    balancerTag: ''
});

const NETWORKS = ['', 'TCP', 'UDP', 'TCP,UDP'];
const PROTOCOLS = ['http', 'tls', 'bittorrent', 'quic'];

function csv(value: string): string[]
{
    if (!value)
    {
        return [];
    }
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}

// A labelled form row: optional comma-hint tooltip on the label, then control.
function Field({
    label,
    htmlFor,
    hint,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="inline-flex items-center gap-1">
        {label}
        {hint && (
          <Tooltip content={hint}>
            <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Tooltip>
        )}
      </Label>
      {children}
    </div>
    );
}

// Toggleable chip group used for multi-value selections (protocol, inbound tags).
function ChipMultiSelect({
    options,
    value,
    onChange,
    empty,
    renderLabel
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  empty?: ReactNode;
  renderLabel?: (opt: string) => ReactNode;
})
{
    if (options.length === 0)
    {
        return <span className="text-sm text-muted-foreground">{empty ?? '—'}</span>;
    }
    return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) =>
      {
          const active = value.includes(opt);
          return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() =>
                onChange(active ? value.filter((v) => v !== opt) : [...value, opt])
            }
            className={cn(
                'inline-flex min-h-[34px] items-center rounded-md border px-3 text-sm transition-colors',
                active
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border bg-surface text-foreground hover:bg-foreground/[0.04]'
            )}
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
          );
      })}
    </div>
    );
}

export default function RuleFormModal({
    open,
    rule,
    inboundTags,
    outboundTags,
    balancerTags,
    onClose,
    onConfirm
}: RuleFormModalProps)
{
    const { t } = useTranslation();
    const [form, setForm] = useState<FormState>(initialForm);
    const isEdit = rule != null;

    const { data: inboundOptions } = useInboundOptions();
    const remarkByTag = useMemo(() =>
    {
        const map: Record<string, string> = {};
        for (const ib of inboundOptions || [])
        {
            if (ib.tag)
            {
                map[ib.tag] = ib.remark?.trim() || ib.tag;
            }
        }
        return map;
    }, [inboundOptions]);

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        if (rule)
        {
            setForm({
                domain: Array.isArray(rule.domain) ? rule.domain.join(',') : rule.domain || '',
                ip: Array.isArray(rule.ip) ? rule.ip.join(',') : rule.ip || '',
                port: rule.port || '',
                sourcePort: rule.sourcePort || '',
                vlessRoute: rule.vlessRoute || '',
                network: rule.network || '',
                sourceIP: Array.isArray(rule.sourceIP) ? rule.sourceIP.join(',') : rule.sourceIP || '',
                user: Array.isArray(rule.user) ? rule.user.join(',') : rule.user || '',
                inboundTag: rule.inboundTag || [],
                protocol: rule.protocol || [],
                attrs: rule.attrs ? Object.entries(rule.attrs) : [],
                outboundTag: rule.outboundTag || '',
                balancerTag: rule.balancerTag || ''
            });
        }
        else
        {
            setForm(initialForm());
        }
    }, [open, rule]);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    function submit()
    {
        const validated = RuleFormSchema.safeParse(form);
        if (!validated.success)
        {
            return;
        }
        const v = validated.data;
        const built: Record<string, unknown> = {
            type: 'field',
            domain: csv(v.domain),
            ip: csv(v.ip),
            port: v.port,
            sourcePort: v.sourcePort,
            vlessRoute: v.vlessRoute,
            network: v.network,
            sourceIP: csv(v.sourceIP),
            user: csv(v.user),
            inboundTag: v.inboundTag,
            protocol: v.protocol,
            attrs: Object.fromEntries(v.attrs.filter(([k]) => k)),
            outboundTag: v.outboundTag === '' ? undefined : v.outboundTag,
            balancerTag: v.balancerTag === '' ? undefined : v.balancerTag
        };
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(built))
        {
            if (v == null)
            {
                continue;
            }
            if (Array.isArray(v) && v.length === 0)
            {
                continue;
            }
            if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
            {
                continue;
            }
            if (v === '')
            {
                continue;
            }
            out[k] = v;
        }
        onConfirm(out);
    }

    const title = isEdit
        ? `${ t('edit') } ${ t('pages.xray.Routings') }`
        : `+ ${ t('pages.xray.Routings') }`;
    const okText = isEdit ? t('pages.clients.submitEdit') : t('create');
    const commaHint = t('pages.xray.rules.useComma');

    return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          <Button onClick={submit}>{okText}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('pages.xray.ruleForm.sourceIps')} htmlFor="rule-srcip" hint={commaHint}>
          <Input
            id="rule-srcip"
            value={form.sourceIP}
            onChange={(e) => update('sourceIP', e.target.value)}
            placeholder="0.0.0.0/8, fc00::/7, geoip:ir"
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.sourcePort')} htmlFor="rule-srcport" hint={commaHint}>
          <Input
            id="rule-srcport"
            value={form.sourcePort}
            onChange={(e) => update('sourcePort', e.target.value)}
            placeholder="53,443,1000-2000"
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.vlessRoute')} htmlFor="rule-vless" hint={commaHint}>
          <Input
            id="rule-vless"
            value={form.vlessRoute}
            onChange={(e) => update('vlessRoute', e.target.value)}
            placeholder="53,443,1000-2000"
          />
        </Field>

        <Field label={t('pages.inbounds.network')} htmlFor="rule-network">
          <Select
            id="rule-network"
            value={form.network}
            onChange={(v) => update('network', v)}
            options={NETWORKS.map((n) => ({ value: n, label: n || '(any)' }))}
          />
        </Field>

        <Field label={t('pages.inbounds.protocol')}>
          <ChipMultiSelect
            options={PROTOCOLS}
            value={form.protocol}
            onChange={(v) => update('protocol', v)}
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.attributes')}>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t('add')}
              onClick={() => update('attrs', [...form.attrs, ['', '']])}
              className="self-start"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
            {form.attrs.map((attr, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface-sunken text-xs text-muted-foreground">
                  {idx + 1}
                </span>
                <Input
                  value={attr[0]}
                  placeholder={t('pages.nodes.name')}
                  onChange={(e) =>
                  {
                      const next = form.attrs.map((a, i) => (i === idx ? ([e.target.value, a[1]] as [string, string]) : a));
                      update('attrs', next);
                  }}
                />
                <Input
                  value={attr[1]}
                  placeholder={t('pages.xray.ruleForm.value')}
                  onChange={(e) =>
                  {
                      const next = form.attrs.map((a, i) => (i === idx ? ([a[0], e.target.value] as [string, string]) : a));
                      update('attrs', next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('remove')}
                  onClick={() => update('attrs', form.attrs.filter((_, i) => i !== idx))}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </Field>

        <Field label="IP" htmlFor="rule-ip" hint={commaHint}>
          <Input
            id="rule-ip"
            value={form.ip}
            onChange={(e) => update('ip', e.target.value)}
            placeholder="0.0.0.0/8, fc00::/7, geoip:ir"
          />
        </Field>

        <Field label={t('domainName')} htmlFor="rule-domain" hint={commaHint}>
          <Input
            id="rule-domain"
            value={form.domain}
            onChange={(e) => update('domain', e.target.value)}
            placeholder="google.com, geosite:cn"
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.user')} htmlFor="rule-user" hint={commaHint}>
          <Input
            id="rule-user"
            value={form.user}
            onChange={(e) => update('user', e.target.value)}
            placeholder="email address"
          />
        </Field>

        <Field label={t('pages.inbounds.port')} htmlFor="rule-port" hint={commaHint}>
          <Input
            id="rule-port"
            value={form.port}
            onChange={(e) => update('port', e.target.value)}
            placeholder="53,443,1000-2000"
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.inboundTags')}>
          <ChipMultiSelect
            options={inboundTags}
            value={form.inboundTag}
            onChange={(v) => update('inboundTag', v)}
            renderLabel={(tag) => remarkByTag[tag] || tag}
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.outboundTag')} htmlFor="rule-outbound">
          <Select
            id="rule-outbound"
            value={form.outboundTag}
            onChange={(v) => update('outboundTag', v)}
            options={outboundTags.map((tag) => ({ value: tag, label: tag || '(none)' }))}
          />
        </Field>

        <Field label={t('pages.xray.ruleForm.balancerTag')} htmlFor="rule-balancer" hint={t('pages.xray.ruleForm.balancerTagTooltip')}>
          <Select
            id="rule-balancer"
            value={form.balancerTag}
            onChange={(v) => update('balancerTag', v)}
            options={balancerTags.map((tag) => ({ value: tag, label: tag || '(none)' }))}
          />
        </Field>
      </div>
    </Modal>
    );
}
