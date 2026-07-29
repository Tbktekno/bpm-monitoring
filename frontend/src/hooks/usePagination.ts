import { useState, useCallback, useMemo } from 'react';
import { ITEMS_PER_PAGE } from '@/constants';

interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const { initialPage = 1, initialLimit = ITEMS_PER_PAGE } = options;
  const [page, setPage] = useState(initialPage);
  const [limit] = useState(initialLimit);

  const nextPage = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToPage = useCallback((p: number) => {
    setPage(Math.max(1, p));
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const totalPages = useCallback((total: number) => {
    return Math.ceil(total / limit) || 1;
  }, [limit]);

  const paginationParams = useMemo(() => ({ page, limit }), [page, limit]);

  return {
    page,
    limit,
    nextPage,
    prevPage,
    goToPage,
    resetPage,
    totalPages,
    paginationParams,
  };
}
