import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tracking-[-0.006em] select-none ' +
  'transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-standard outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:pointer-events-none disabled:opacity-50';

// Tactile press (1px nudge + drop the shadow) gives the premium, physical feel.
const press = 'active:translate-y-px active:shadow-none';

const variantClasses: Record<ButtonVariant, string> = {
    // Brand-indigo solid with a hairline elevation for depth.
    primary: `bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover ${ press }`,
    // Clean hairline that *defines* on hover; subtle elevation lifts it off the surface.
    secondary:
    `border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-sunken ${ press }`,
    ghost: `bg-transparent text-muted-foreground hover:bg-surface-sunken hover:text-foreground ${ press }`,
    danger: `bg-danger text-danger-foreground shadow-xs hover:opacity-90 ${ press }`,
    link: 'h-auto bg-transparent p-0 text-accent underline-offset-4 hover:underline'
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-9 px-3.5 text-sm',
    lg: 'h-10 px-4.5 text-sm',
    icon: 'h-9 w-9 p-0'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { className, variant = 'primary', size = 'md', loading = false, disabled, children, type, ...props },
    ref
)
{
    return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
          base,
          variantClasses[variant],
          variant === 'link' ? 'h-auto px-0' : sizeClasses[size],
          className
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
    );
});
