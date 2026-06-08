import { Skeleton } from './Skeleton';

interface TableSkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
}

// TableSkeleton is the shared loading placeholder for data tables — a shimmering
// header bar + rows. It replaces full-page spinners so the surrounding page
// chrome (titles, summary cards) stays visible and the load feels instant.
export default function TableSkeleton({ rows = 6 }: TableSkeletonProps)
{
    return (
    <div aria-busy="true" aria-live="polite" className="grid gap-2">
      <Skeleton className="h-[38px] w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
    );
}
