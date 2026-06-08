import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { Input, type InputProps } from './Input';

export type SearchInputProps = Omit<InputProps, 'startIcon' | 'type'>;

/**
 * Standard search field: a leading search icon + input. Used for every list/
 * filter search box so they look identical across pages. Token-only, RTL-safe.
 * Pass width via `className` (it lands on the wrapper).
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    { className, ...props },
    ref
)
{
    return (
    <Input
      ref={ref}
      type="search"
      startIcon={<Search aria-hidden />}
      wrapperClassName={className}
      className="[&::-webkit-search-cancel-button]:appearance-none"
      {...props}
    />
    );
});
