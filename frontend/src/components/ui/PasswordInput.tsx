import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './Input';

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** aria-labels for the visibility toggle. */
  showLabel?: string;
  hideLabel?: string;
  /** Optional leading icon (inline-start). */
  startIcon?: ReactNode;
};

/**
 * Password field with a show/hide toggle. It is just an <Input> — so the box,
 * height, padding, border, focus ring and invalid styling are byte-identical to
 * every other input — with the eye toggle rendered as the input's end-icon.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
    { showLabel = 'Show password', hideLabel = 'Hide password', startIcon, ...props },
    ref
)
{
    const [show, setShow] = useState(false);
    return (
    <Input
      ref={ref}
      type={show ? 'text' : 'password'}
      startIcon={startIcon}
      endIcon={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? hideLabel : showLabel}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      }
      {...props}
    />
    );
});
