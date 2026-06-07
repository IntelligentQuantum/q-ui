import { Skeleton } from 'antd';

interface TableSkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
}

// TableSkeleton is the shared loading placeholder for data tables — a shimmering
// header bar + rows. It replaces full-page spinners so the surrounding page
// chrome (titles, summary cards) stays visible and the load feels instant.
export default function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 8 }}>
      <Skeleton.Input active block style={{ height: 38, borderRadius: 8 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton.Input key={i} active block style={{ height: 44, borderRadius: 8 }} />
      ))}
    </div>
  );
}
