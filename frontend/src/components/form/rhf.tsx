/**
 * react-hook-form helper layer — bound field primitives that mirror the old
 * AntD `Form.Item` API so the big config forms can be converted mechanically.
 *
 * Pattern: the host form does `const methods = useForm({ defaultValues })` and
 * wraps children in `<FormProvider {...methods}>`. Every child field below reads
 * the form via `useFormContext()` and binds by DOT-PATH `name`
 * (e.g. "streamSettings.wsSettings.path"). Dynamic arrays use `useFieldArray`.
 * Validation: pass `rules` (RHF RegisterOptions); for a zod field schema use
 * `zodRule(schema, t)` which preserves the i18n message keys.
 */
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Controller,
    FormProvider,
    useFieldArray,
    useForm,
    useFormContext,
    useWatch
} from 'react-hook-form';
import type { Control, FieldValues, RegisterOptions } from 'react-hook-form';
import type { TFunction } from 'i18next';
import type { z } from 'zod';

import { Input, Textarea, Switch, Select, Label, cn } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

export { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch };
export type { Control, FieldValues };

// Read a nested error message by dot-path (RHF stores errors as a nested object).
function errorAt(errors: Record<string, unknown>, name: string): string | undefined
{
    let cur: unknown = errors;
    for (const part of name.split('.'))
    {
        if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>))
        {
            cur = (cur as Record<string, unknown>)[part];
        }
        else
        {
            return undefined;
        }
    }
    const msg = (cur as { message?: unknown } | undefined)?.message;
    return typeof msg === 'string' ? msg : undefined;
}

/** Convert a zod field schema (messages are i18n keys) into an RHF validate rule. */
export function zodRule<T extends z.ZodType>(schema: T, t: TFunction): RegisterOptions
{
    return {
        validate: (value: unknown) =>
        {
            const r = schema.safeParse(value);
            if (r.success)
            {
                return true;
            }
            const key = r.error.issues[0]?.message ?? 'validation.invalid';
            return t(key, { defaultValue: key });
        }
    };
}

// ---- Field shell -----------------------------------------------------------

export interface FieldProps {
  /** Dot-path; also used as the control id + to look up the error. */
  name?: string;
  label?: ReactNode;
  hint?: ReactNode;
  /** Explicit error override; otherwise read from form state by `name`. */
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
  /** Hide the label row (for inline/standalone fields). */
  noLabel?: boolean;
}

export function Field({ name, label, hint, error, required, className, children, noLabel }: FieldProps)
{
    const ctx = useFormContext();
    const resolved = error ?? (name && ctx ? errorAt(ctx.formState.errors as Record<string, unknown>, name) : undefined);
    return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {!noLabel && label != null && (
        <Label htmlFor={name}>
          {label}
          {required && <span className="ms-0.5 text-danger">*</span>}
        </Label>
      )}
      {children}
      {resolved ? (
        <span className="text-xs text-danger">{resolved}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
    );
}

// ---- Bound inputs ----------------------------------------------------------

interface CommonFieldProps {
  name: string;
  label?: ReactNode;
  hint?: ReactNode;
  rules?: RegisterOptions;
  required?: boolean;
  className?: string;
}

export function RHFText({
    name,
    label,
    hint,
    rules,
    required,
    className,
    ...input
}: CommonFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>)
{
    const { register, formState } = useFormContext();
    const invalid = !!errorAt(formState.errors as Record<string, unknown>, name);
    return (
    <Field name={name} label={label} hint={hint} required={required} className={className}>
      <Input id={name} aria-invalid={invalid} {...register(name, rules)} {...input} />
    </Field>
    );
}

export function RHFNumber({
    name,
    label,
    hint,
    rules,
    required,
    className,
    ...input
}: CommonFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>)
{
    const { register, formState } = useFormContext();
    const invalid = !!errorAt(formState.errors as Record<string, unknown>, name);
    return (
    <Field name={name} label={label} hint={hint} required={required} className={className}>
      <Input
        id={name}
        type="number"
        inputMode="numeric"
        aria-invalid={invalid}
        {...register(name, { ...rules, valueAsNumber: true } as RegisterOptions)}
        {...input}
      />
    </Field>
    );
}

export function RHFTextarea({
    name,
    label,
    hint,
    rules,
    required,
    className,
    ...input
}: CommonFieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>)
{
    const { register, formState } = useFormContext();
    const invalid = !!errorAt(formState.errors as Record<string, unknown>, name);
    return (
    <Field name={name} label={label} hint={hint} required={required} className={className}>
      <Textarea id={name} aria-invalid={invalid} {...register(name, rules)} {...input} />
    </Field>
    );
}

export function RHFSelect({
    name,
    label,
    hint,
    rules,
    required,
    className,
    options,
    placeholder,
    disabled
}: CommonFieldProps & { options: SelectOption[]; placeholder?: string; disabled?: boolean })
{
    const { control } = useFormContext();
    return (
    <Field name={name} label={label} hint={hint} required={required} className={className}>
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field, fieldState }) => (
          <Select
            id={name}
            value={field.value ?? null}
            onChange={field.onChange}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
          />
        )}
      />
    </Field>
    );
}

export function RHFSwitch({
    name,
    label,
    hint,
    className,
    disabled
}: Omit<CommonFieldProps, 'rules'> & { disabled?: boolean })
{
    const { control } = useFormContext();
    return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex flex-col gap-0.5">
        {label != null && <Label htmlFor={name}>{label}</Label>}
        {hint != null && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            id={name}
            checked={!!field.value}
            onCheckedChange={field.onChange}
            disabled={disabled}
            aria-label={typeof label === 'string' ? label : name}
          />
        )}
      />
    </div>
    );
}

// Free-form tags input bound to a string[] field (replaces AntD `<Select mode="tags">`).
export function TagsEditor({
    value,
    onChange,
    placeholder,
    suggestions
}: {
  value: unknown;
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** Optional autocomplete presets (free text is still allowed). */
  suggestions?: { value: string; label?: string }[];
})
{
    const tags = Array.isArray(value) ? (value as string[]) : [];
    const [text, setText] = useState('');
    const listId = useId();
    const add = (raw: string) =>
    {
        const v = raw.trim();
        if (v && !tags.includes(v))
        {
            onChange([...tags, v]);
        }
        setText('');
    };
    const removeAt = (i: number) => onChange(tags.filter((_, idx) => idx !== i));
    return (
    <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35">
      {tags.map((tag, i) => (
        <span
          key={`${ tag }-${ i }`}
          className="inline-flex items-center gap-1 rounded bg-surface-sunken px-2 py-0.5 text-xs text-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label="remove"
            className="text-muted-foreground transition-colors hover:text-danger"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={tags.length === 0 ? placeholder : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) =>
        {
            if (e.key === 'Enter' || e.key === ',')
            {
                e.preventDefault();
                add(text);
            }
            else if (e.key === 'Backspace' && !text && tags.length)
            {
                removeAt(tags.length - 1);
            }
        }}
        onBlur={() => text && add(text)}
        list={suggestions ? listId : undefined}
        className="min-w-[8ch] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s.value} value={s.value} label={s.label} />
          ))}
        </datalist>
      )}
    </div>
    );
}

export function RHFTags({
    name,
    label,
    hint,
    className,
    placeholder
}: Omit<CommonFieldProps, 'rules'> & { placeholder?: string })
{
    const { control } = useFormContext();
    return (
    <Field name={name} label={label} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => <TagsEditor value={field.value} onChange={field.onChange} placeholder={placeholder} />}
      />
    </Field>
    );
}

/** Generic escape hatch: render any control via a Controller render-prop. */
export function RHFField({
    name,
    label,
    hint,
    rules,
    required,
    className,
    control: ctrl,
    render
}: CommonFieldProps & {
  control?: Control<FieldValues>;
  render: (field: {
    value: unknown;
    onChange: (v: unknown) => void;
    onBlur: () => void;
    invalid: boolean;
  }) => ReactNode;
})
{
    const ctx = useFormContext();
    const control = ctrl ?? ctx.control;
    return (
    <Field name={name} label={label} hint={hint} required={required} className={className}>
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field, fieldState }) =>
          render({
              value: field.value,
              onChange: field.onChange,
              onBlur: field.onBlur,
              invalid: !!fieldState.error
          }) as React.ReactElement
        }
      />
    </Field>
    );
}
