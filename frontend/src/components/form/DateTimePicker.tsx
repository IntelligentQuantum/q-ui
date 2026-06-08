import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { PersianDateTimePicker } from 'persian-calendar-suite';

import { Input } from '@/components/ui';
import { useDatepicker } from '@/hooks/useDatepicker';
import { useTheme } from '@/hooks/useTheme';

interface DateTimePickerProps {
  value: Dayjs | null;
  onChange: (next: Dayjs | null) => void;
  showTime?: boolean;
  format?: string;
  placeholder?: string;
  disabled?: boolean;
}

// Mirrors the indigo brand + surfaces from theme.css (the lib needs plain hex,
// so these approximate the oklch tokens).
const LIGHT_THEME = {
    primaryColor: '#4f46e5',
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e8',
    hoverColor: 'rgba(79, 70, 229, 0.10)',
    selectedTextColor: '#ffffff',
    textColor: 'rgba(0, 0, 0, 0.85)'
};

const DARK_THEME = {
    primaryColor: '#6366f1',
    backgroundColor: '#2a2e37',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    hoverColor: 'rgba(99, 102, 241, 0.20)',
    selectedTextColor: '#ffffff',
    textColor: 'rgba(255, 255, 255, 0.90)'
};

const ULTRA_DARK_THEME = DARK_THEME;

export default function DateTimePicker({
    value,
    onChange,
    showTime = true,
    placeholder = '',
    disabled = false
}: DateTimePickerProps)
{
    const { datepicker } = useDatepicker();
    const { isDark, isUltra } = useTheme();

    const persianTheme = useMemo(() =>
    {
        if (isUltra)
        {
            return ULTRA_DARK_THEME;
        }
        if (isDark)
        {
            return DARK_THEME;
        }
        return LIGHT_THEME;
    }, [isDark, isUltra]);

    if (datepicker === 'jalalian')
    {
        return (
      <div className={`jdp-wrap${ isDark ? ' jdp-dark' : '' }${ isUltra ? ' jdp-ultra' : '' }${ disabled ? ' jdp-disabled' : '' }`}>
        <PersianDateTimePicker
          value={value ? value.valueOf() : null}
          onChange={(next: number | string | null) =>
          {
              if (next == null || next === '')
              {
                  onChange(null);
                  return;
              }
              const ms = typeof next === 'number' ? next : Number(next);
              if (Number.isFinite(ms))
              {
                  onChange(dayjs(ms));
              }
          }}
          showTime={showTime}
          outputFormat="timestamp"
          persianNumbers
          rtlCalendar
          theme={persianTheme}
        />
      </div>
        );
    }

    // Gregorian fallback: a native date / datetime-local input (RTL-aware, zero
    // dependency). The jalali branch above keeps the rich Persian calendar.
    const nativeType = showTime ? 'datetime-local' : 'date';
    const nativeValue = value ? value.format(showTime ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD') : '';

    return (
    <Input
      type={nativeType}
      step={showTime ? 1 : undefined}
      value={nativeValue}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) =>
      {
          const v = e.target.value;
          onChange(v ? dayjs(v) : null);
      }}
    />
    );
}
