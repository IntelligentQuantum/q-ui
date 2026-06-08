import { cn } from './cn';
import { SpinnerIcon } from './icons';

export interface SpinnerProps {
  className?: string;
  /** Visible label for assistive tech; defaults to "Loading". */
  label?: string;
}

export function Spinner({ className, label = 'Loading' }: SpinnerProps)
{
    return (
    <SpinnerIcon
      role="status"
      aria-label={label}
      className={cn('h-4 w-4 animate-spin text-current', className)}
    />
    );
}
