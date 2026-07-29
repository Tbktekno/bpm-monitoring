import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T, index: number) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  cardless?: boolean;
}

function CardWrapper({ cardless, children }: { cardless?: boolean; children: ReactNode }) {
  if (cardless) return <>{children}</>;
  return <div className="card overflow-hidden">{children}</div>;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  error,
  onRetry,
  onRowClick,
  emptyMessage,
  emptyAction,
  cardless,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <CardWrapper cardless={cardless}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-5 w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardWrapper>
    );
  }

  if (error) {
    const content = (
      <div className="text-center">
        <p className="text-danger-500 mb-2">Gagal memuat data</p>
        <p className="text-sm text-slate-500 mb-4">{error.message}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-primary text-sm">
            Coba Lagi
          </button>
        )}
      </div>
    );
    if (cardless) return <div className="p-8">{content}</div>;
    return <div className="card p-8">{content}</div>;
  }

  if (data.length === 0) {
    if (cardless) {
      return (
        <div className="p-8">
          <EmptyState message={emptyMessage || 'Tidak ada data'} action={emptyAction} />
        </div>
      );
    }
    return (
      <div className="card p-8">
        <EmptyState message={emptyMessage || 'Tidak ada data'} action={emptyAction} />
      </div>
    );
  }

  return (
    <CardWrapper cardless={cardless}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
              {data.map((item, idx) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`border-b border-gray-50 transition-colors duration-150 ${
                  onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3.5 text-sm text-slate-700 ${col.className || ''}`}>
                    {col.render(item, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardWrapper>
  );
}
