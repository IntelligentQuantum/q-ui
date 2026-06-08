import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>)
{
    return <div className={cn('animate-pulse rounded-md bg-surface-sunken', className)} {...props} />;
}
