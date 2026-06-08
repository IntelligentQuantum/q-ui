import { cn } from './cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

// RTL-safe: the thumb is positioned with the logical `start` inset and animated
// via inset-inline-start, so it slides toward the end in LTR and toward the
// start in RTL automatically.
export function Switch({ checked, onCheckedChange, disabled, id, className, ...aria }: SwitchProps)
{
    return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none',
          'transition-colors duration-150 ease-standard',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-border-strong',
          className
      )}
      {...aria}
    >
      <span
        className={cn(
            'absolute h-4 w-4 rounded-full bg-white shadow-sm',
            'transition-[inset-inline-start] duration-150 ease-standard',
            checked ? 'start-[1.125rem]' : 'start-0.5'
        )}
      />
    </button>
    );
}
