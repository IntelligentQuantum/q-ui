import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from './cn';
import { inputClasses } from './Input';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref)
{
    return (
    <textarea
      ref={ref}
      className={cn(inputClasses, 'h-auto min-h-20 py-2 leading-normal', className)}
      {...props}
    />
    );
});
