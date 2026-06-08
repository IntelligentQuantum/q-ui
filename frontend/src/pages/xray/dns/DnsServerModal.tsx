import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import type { Control, FieldErrors } from 'react-hook-form';
import { Minus, Plus } from 'lucide-react';

import { Button, Input, Label, Modal, Select, Switch } from '@/components/ui';
import type { TFunction } from 'i18next';
import type { z } from 'zod';
import {
    DnsQueryStrategySchema,
    DnsServerObjectInnerSchema,
    DnsServerObjectSchema,
    type DnsServerObject
} from '@/schemas/dns';

export type DnsServerValue =
  | string
  | (DnsServerObject & {
      expectIPs?: string[];
      [key: string]: unknown;
    });

interface DnsServerModalProps {
  open: boolean;
  server: DnsServerValue | null;
  isEdit: boolean;
  onClose: () => void;
  onConfirm: (value: DnsServerValue) => void;
}

const STRATEGIES = DnsQueryStrategySchema.options;

interface DnsServerForm {
  address: string;
  port: number;
  domains: { value: string }[];
  expectedIPs: { value: string }[];
  unexpectedIPs: { value: string }[];
  queryStrategy: string;
  skipFallback: boolean;
  disableCache: boolean;
  finalQuery: boolean;
  tag: string;
  clientIP: string;
  serveStale: boolean;
  serveExpiredTTL: number;
  timeoutMs: number;
}

const wrap = (arr: string[]): { value: string }[] => arr.map((value) => ({ value }));
const unwrap = (arr: { value: string }[]): string[] => arr.map((x) => x.value);

function defaultFormValues(): DnsServerForm
{
    return {
        address: 'localhost',
        port: 53,
        domains: [],
        expectedIPs: [],
        unexpectedIPs: [],
        queryStrategy: 'UseIP',
        skipFallback: false,
        disableCache: false,
        finalQuery: false,
        tag: '',
        clientIP: '',
        serveStale: false,
        serveExpiredTTL: 0,
        timeoutMs: 4000
    };
}

function valuesFromServer(server: DnsServerValue | null): DnsServerForm
{
    if (server == null)
    {
        return defaultFormValues();
    }
    if (typeof server === 'string')
    {
        return { ...defaultFormValues(), address: server };
    }
    const parsed = DnsServerObjectSchema.safeParse(server);
    const data = parsed.success ? parsed.data : null;
    return {
        ...defaultFormValues(),
        address: (data?.address ?? server.address) || 'localhost',
        port: data?.port ?? server.port ?? 53,
        domains: wrap(data?.domains ?? server.domains ?? []),
        expectedIPs: wrap(data?.expectedIPs ?? server.expectedIPs ?? server.expectIPs ?? []),
        unexpectedIPs: wrap(data?.unexpectedIPs ?? server.unexpectedIPs ?? []),
        queryStrategy: data?.queryStrategy ?? server.queryStrategy ?? 'UseIP',
        skipFallback: data?.skipFallback ?? server.skipFallback ?? false,
        disableCache: data?.disableCache ?? server.disableCache ?? false,
        finalQuery: data?.finalQuery ?? server.finalQuery ?? false,
        tag: data?.tag ?? server.tag ?? '',
        clientIP: data?.clientIP ?? server.clientIP ?? '',
        serveStale: data?.serveStale ?? server.serveStale ?? false,
        serveExpiredTTL: data?.serveExpiredTTL ?? server.serveExpiredTTL ?? 0,
        timeoutMs: data?.timeoutMs ?? server.timeoutMs ?? 4000
    };
}

function valuesToWire(values: DnsServerForm): DnsServerValue
{
    const domains = unwrap(values.domains).filter(Boolean);
    const expectedIPs = unwrap(values.expectedIPs).filter(Boolean);
    const unexpectedIPs = unwrap(values.unexpectedIPs).filter(Boolean);
    const isPlain
    = values.domains.length === 0
    && values.expectedIPs.length === 0
    && values.unexpectedIPs.length === 0
    && values.port === 53
    && values.queryStrategy === 'UseIP'
    && values.skipFallback === false
    && values.disableCache === false
    && values.finalQuery === false
    && !values.tag
    && !values.clientIP
    && values.serveStale === false
    && values.serveExpiredTTL === 0
    && values.timeoutMs === 4000;
    if (isPlain)
    {
        return values.address;
    }

    const out: Record<string, unknown> = {
        address: values.address,
        port: values.port,
        domains,
        expectedIPs,
        unexpectedIPs,
        queryStrategy: values.queryStrategy,
        skipFallback: values.skipFallback,
        disableCache: values.disableCache,
        finalQuery: values.finalQuery,
        serveStale: values.serveStale,
        serveExpiredTTL: values.serveExpiredTTL,
        timeoutMs: values.timeoutMs
    };
    if (values.tag)
    {
        out.tag = values.tag;
    }
    if (values.clientIP)
    {
        out.clientIP = values.clientIP;
    }
    return out as DnsServerValue;
}

const shape = DnsServerObjectInnerSchema.shape;

// Mirror the old antdRule(): run the field's zod schema and, on failure, surface
// the first issue message through i18n (falling back to the raw message).
function zodFieldValidate<T>(schema: z.ZodType, t: TFunction)
{
    return (value: T) =>
    {
        const res = schema.safeParse(value);
        if (res.success)
        {
            return true;
        }
        const key = res.error.issues[0]?.message ?? 'validation.invalid';
        return t(key, { defaultValue: key });
    };
}

// One labelled row: label on the start side (stacked on phones), control filling
// the rest. Optional validation error below.
function Field({
    label,
    htmlFor,
    error,
    children
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
})
{
    return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[160px_1fr] sm:items-center sm:gap-3">
      <Label htmlFor={htmlFor} className="sm:text-end">
        {label}
      </Label>
      <div className="flex flex-col gap-1">
        {children}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
    );
}

function StringList({
    label,
    name,
    control,
    t
}: {
  label: string;
  name: 'domains' | 'expectedIPs' | 'unexpectedIPs';
  control: Control<DnsServerForm>;
  t: TFunction;
})
{
    const { fields, append, remove } = useFieldArray({ control, name });
    return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[160px_1fr] sm:items-start sm:gap-3">
      <Label className="pt-1.5 sm:text-end">{label}</Label>
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            size="sm"
            aria-label={t('add')}
            onClick={() => append({ value: '' })}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {fields.map((f, idx) => (
          <Controller
            key={f.id}
            control={control}
            name={`${ name }.${ idx }.value` as const}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Input {...field} />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={t('delete')}
                  onClick={() => remove(idx)}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          />
        ))}
      </div>
    </div>
    );
}

export default function DnsServerModal({
    open,
    server,
    isEdit,
    onClose,
    onConfirm
}: DnsServerModalProps)
{
    const { t } = useTranslation();
    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors }
    } = useForm<DnsServerForm>({ defaultValues: defaultFormValues() });

    useEffect(() =>
    {
        if (!open)
        {
            return;
        }
        reset(valuesFromServer(server));
    }, [open, server, reset]);

    const submit = handleSubmit((values) => onConfirm(valuesToWire(values)));

    const title = isEdit ? t('pages.xray.dns.edit') : t('pages.xray.dns.add');
    const fieldErrs = errors as FieldErrors<DnsServerForm>;

    return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      closeOnOverlay={false}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          <Button onClick={submit}>{t('confirm')}</Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('pages.inbounds.address')} htmlFor="dns-srv-address" error={fieldErrs.address?.message}>
          <Input
            id="dns-srv-address"
            aria-invalid={!!fieldErrs.address}
            {...register('address', { validate: zodFieldValidate<string>(shape.address, t) })}
          />
        </Field>

        <Field label={t('pages.inbounds.port')} htmlFor="dns-srv-port" error={fieldErrs.port?.message}>
          <Input
            id="dns-srv-port"
            type="number"
            min={1}
            max={65535}
            aria-invalid={!!fieldErrs.port}
            {...register('port', { valueAsNumber: true, validate: zodFieldValidate<number>(shape.port, t) })}
          />
        </Field>

        <Field label={t('pages.xray.dns.tag')} htmlFor="dns-srv-tag">
          <Input id="dns-srv-tag" {...register('tag')} />
        </Field>

        <Field label={t('pages.xray.dns.clientIp')} htmlFor="dns-srv-clientip">
          <Input id="dns-srv-clientip" {...register('clientIP')} />
        </Field>

        <Field label={t('pages.xray.dns.strategy')}>
          <Controller
            control={control}
            name="queryStrategy"
            render={({ field }) => (
              <Select
                value={field.value}
                onChange={field.onChange}
                options={STRATEGIES.map((s) => ({ value: s, label: s }))}
              />
            )}
          />
        </Field>

        <Field label={t('pages.xray.dns.timeoutMs')} htmlFor="dns-srv-timeout" error={fieldErrs.timeoutMs?.message}>
          <Input
            id="dns-srv-timeout"
            type="number"
            min={0}
            step={500}
            aria-invalid={!!fieldErrs.timeoutMs}
            {...register('timeoutMs', { valueAsNumber: true, validate: zodFieldValidate<number>(shape.timeoutMs, t) })}
          />
        </Field>

        <div className="my-1 border-t border-border" />

        <StringList label={t('pages.xray.dns.domains')} name="domains" control={control} t={t} />
        <StringList label={t('pages.xray.dns.expectIPs')} name="expectedIPs" control={control} t={t} />
        <StringList label={t('pages.xray.dns.unexpectIPs')} name="unexpectedIPs" control={control} t={t} />

        <div className="my-1 border-t border-border" />

        <Field label={t('pages.xray.dns.skipFallback')}>
          <Controller
            control={control}
            name="skipFallback"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </Field>
        <Field label={t('pages.xray.dns.finalQuery')}>
          <Controller
            control={control}
            name="finalQuery"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </Field>
        <Field label={t('pages.xray.dns.disableCache')}>
          <Controller
            control={control}
            name="disableCache"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </Field>
        <Field label={t('pages.xray.dns.serveStale')}>
          <Controller
            control={control}
            name="serveStale"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </Field>
        <Field label={t('pages.xray.dns.serveExpiredTTL')} htmlFor="dns-srv-ttl">
          <Input
            id="dns-srv-ttl"
            type="number"
            min={0}
            step={60}
            {...register('serveExpiredTTL', { valueAsNumber: true })}
          />
        </Field>
      </form>
    </Modal>
    );
}
