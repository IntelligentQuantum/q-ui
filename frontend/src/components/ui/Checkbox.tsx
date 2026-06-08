import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { CheckIcon } from './icons';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Optional inline label rendered after the box. */
  children?: ReactNode;
  boxClassName?: string;
}

// A real <input type=checkbox> (visually hidden, keyboard + form native) drives
// a styled sibling box via `peer-*`. The check glyph inherits the box's text
// color, so it's invisible (text-transparent) until checked.
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
    { className, boxClassName, children, disabled, ...props },
    ref
)
{
    return (
    <label
      className={cn(
          'inline-flex items-center gap-2 select-none',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className
      )}
    >
      <input ref={ref} type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
      <span
        className={cn(
            'grid h-4 w-4 place-items-center rounded-[0.3rem] border border-border bg-surface text-transparent',
            'transition-colors duration-150 ease-standard',
            'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
            boxClassName
        )}
      >
        <CheckIcon className="h-3 w-3" strokeWidth={3} />
      </span>
      {children != null && <span className="text-sm text-foreground">{children}</span>}
    </label>
    );
});
