import { describe, expect, it } from 'vitest';
import { SizeFormatter } from '@/utils';

describe('SizeFormatter.sizeFormat', () =>
{
    it('formats zero, negative and nullish values as 0 B', () =>
    {
        expect(SizeFormatter.sizeFormat(0)).toBe('0 B');
        expect(SizeFormatter.sizeFormat(-1)).toBe('0 B');
        expect(SizeFormatter.sizeFormat(null)).toBe('0 B');
        expect(SizeFormatter.sizeFormat(undefined)).toBe('0 B');
    });

    it('formats non-finite values as 0 B', () =>
    {
        expect(SizeFormatter.sizeFormat(NaN)).toBe('0 B');
        expect(SizeFormatter.sizeFormat(Infinity)).toBe('0 B');
        expect(SizeFormatter.sizeFormat(-Infinity)).toBe('0 B');
    });

    it('formats across unit ladder', () =>
    {
        expect(SizeFormatter.sizeFormat(512)).toBe('512 B');
        expect(SizeFormatter.sizeFormat(1536)).toBe('1.50 KB');
        expect(SizeFormatter.sizeFormat(1024 * 1024)).toBe('1.00 MB');
        expect(SizeFormatter.sizeFormat(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
});

describe('SizeFormatter.speedFormat', () =>
{
    it('formats zero, negative, nullish and non-finite as 0 B/s', () =>
    {
        expect(SizeFormatter.speedFormat(0)).toBe('0 B/s');
        expect(SizeFormatter.speedFormat(-1)).toBe('0 B/s');
        expect(SizeFormatter.speedFormat(null)).toBe('0 B/s');
        expect(SizeFormatter.speedFormat(undefined)).toBe('0 B/s');
        expect(SizeFormatter.speedFormat(NaN)).toBe('0 B/s');
        expect(SizeFormatter.speedFormat(Infinity)).toBe('0 B/s');
    });

    it('appends /s to the formatted size', () =>
    {
        expect(SizeFormatter.speedFormat(512)).toBe('512 B/s');
        expect(SizeFormatter.speedFormat(1536)).toBe('1.50 KB/s');
        expect(SizeFormatter.speedFormat(1024 * 1024)).toBe('1.00 MB/s');
        expect(SizeFormatter.speedFormat(1024 * 1024 * 1024)).toBe('1.00 GB/s');
    });
});
