import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export const inputClasses =
  'flex h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground ' +
  'placeholder:text-muted-foreground transition-[color,border-color,box-shadow] duration-150 ease-standard ' +
  'outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/35';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon (start side). Adds inline-start padding automatically. */
  startIcon?: ReactNode;
  /** Trailing icon/element (end side). */
  endIcon?: ReactNode;
  /** Class for the wrapper when an icon is present (e.g. width). */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, type, startIcon, endIcon, wrapperClassName, ...props },
    ref
)
{
    const field = (
    <input
      ref={ref}
      type={type ?? 'text'}
      className={cn(inputClasses, startIcon ? 'ps-9' : undefined, endIcon ? 'pe-9' : undefined, className)}
      {...props}
    />
    );

    if (!startIcon && !endIcon)
    {
        return field;
    }

    return (
    <div className={cn('relative w-full', wrapperClassName)}>
      {startIcon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {startIcon}
        </span>
      )}
      {field}
      {endIcon && (
        <span className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {endIcon}
        </span>
      )}
    </div>
    );
});
