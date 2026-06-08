import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import FinalMaskFormRhf from '@/lib/xray/forms/transport/FinalMaskFormRhf';
import type { FinalMaskStreamSettings } from '@/schemas/protocols/stream/finalmask';

interface SubJsonFinalMaskFormProps {
  value: string;
  onChange: (next: string) => void;
}

function hasValue(v: unknown): boolean
{
    if (v == null)
    {
        return false;
    }
    if (Array.isArray(v))
    {
        return v.some(hasValue);
    }
    if (typeof v === 'object')
    {
        return Object.values(v as Record<string, unknown>).some(hasValue);
    }
    if (typeof v === 'string')
    {
        return v.length > 0;
    }
    return true;
}

function parseFinalMask(raw: string): FinalMaskStreamSettings
{
    try
    {
        if (raw)
        {
            return JSON.parse(raw) as FinalMaskStreamSettings;
        }
    }
    catch
    {
        return { tcp: [], udp: [] };
    }
    return { tcp: [], udp: [] };
}

// Watches the `finalmask` slice and serializes it back out. Must live inside the
// FormProvider so useWatch reads the context.
function Inner({ value, onChange }: SubJsonFinalMaskFormProps)
{
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const finalmask = useWatch({ name: 'finalmask' }) as FinalMaskStreamSettings | undefined;

    useEffect(() =>
    {
        if (finalmask === undefined)
        {
            return;
        }
        const next = hasValue(finalmask) ? JSON.stringify(finalmask) : '';
        if (next !== value)
        {
            onChangeRef.current(next);
        }
    }, [finalmask, value]);

    return <FinalMaskFormRhf name="finalmask" network="" protocol="" showAll />;
}

export default function SubJsonFinalMaskForm({ value, onChange }: SubJsonFinalMaskFormProps)
{
    const [initial] = useState(() => parseFinalMask(value));
    const methods = useForm({ defaultValues: { finalmask: initial } });
    return (
    <FormProvider {...methods}>
      <Inner value={value} onChange={onChange} />
    </FormProvider>
    );
}
