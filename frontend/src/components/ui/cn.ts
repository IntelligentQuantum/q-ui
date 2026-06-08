// Tiny zero-dependency className joiner. We deliberately avoid clsx/tailwind-merge
// (no extra deps); primitives own their class strings so conflicting-utility
// merging isn't needed. Falsy values are dropped; arrays are flattened.
export type ClassValue = string | number | null | false | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string
{
    const out: string[] = [];
    const walk = (v: ClassValue) =>
    {
        if (v === null || v === undefined || v === false || v === '')
        {
            return;
        }
        if (Array.isArray(v))
        {
            v.forEach(walk);
        }
        else
        {
            out.push(String(v));
        }
    };
    inputs.forEach(walk);
    return out.join(' ');
}
