import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from './cn';

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** aria-labels for the visibility toggle. */
  showLabel?: string;
  hideLabel?: string;
  /** Optional leading icon (inline-start). */
  startIcon?: ReactNode;
};

/**
 * Password field with a show/hide toggle. The bordered box is the control: it
 * owns the border + focus ring (via `focus-within`), the <input> inside is
 * borderless/transparent, and the eye toggle is a normal inline child at the
 * inline-end (RTL-safe, excluded from tab order). This avoids an absolutely
 * positioned button overlapping the input's focus ring.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
    { className, showLabel = 'Show password', hideLabel = 'Hide password', startIcon, 'aria-invalid': ariaInvalid, ...props },
    ref
)
{
    const [show, setShow] = useState(false);
    return (
    <div
      className={cn(
          'flex h-9 w-full items-center rounded-md border bg-surface pe-3',
          // No start padding when an icon is present — the w-9 icon zone supplies
          // it, matching Input's `ps-9` so both align identically.
          startIcon ? 'ps-0' : 'ps-3',
          'transition-[color,border-color,box-shadow] duration-150 ease-standard',
          'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
          ariaInvalid
              ? 'border-danger focus-within:ring-2 focus-within:ring-danger/35'
              : 'border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35',
          className
      )}
    >
      {startIcon && (
        <span className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {startIcon}
        </span>
      )}
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        aria-invalid={ariaInvalid}
        className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? hideLabel : showLabel}
        className="ms-2 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
    );
});
