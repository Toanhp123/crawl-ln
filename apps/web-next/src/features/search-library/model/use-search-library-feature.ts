import { useMemo, useState } from 'react';
import {
  useLibrarySearch,
  type SearchDocumentType,
  type SearchResultItem
} from '../../../entities/search';

export interface UseSearchLibraryFeatureOptions {
  initialType?: SearchDocumentType;
  pageSize?: number;
  novelId?: string;
  onSelect?: (item: SearchResultItem) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  type?: SearchDocumentType;
  onTypeChange?: (value: SearchDocumentType) => void;
  page?: number;
  onPageChange?: (value: number) => void;
}

export function useSearchLibraryFeature(options: UseSearchLibraryFeatureOptions = {}) {
  const [internalQuery, setInternalQuery] = useState('');
  const [internalType, setInternalType] = useState<SearchDocumentType>(
    options.initialType ?? 'all'
  );
  const [internalPage, setInternalPage] = useState(1);
  const query = options.query ?? internalQuery;
  const type = options.type ?? internalType;
  const page = options.page ?? internalPage;
  const pageSize = options.pageSize ?? 20;
  const normalized = query.trim();
  const result = useLibrarySearch({
    q: normalized,
    type,
    novelId: options.novelId,
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((result.data?.total ?? 0) / pageSize)),
    [pageSize, result.data?.total]
  );
  const updatePage = (value: number) => {
    if (options.onPageChange) options.onPageChange(value);
    else setInternalPage(value);
  };
  const updateQuery = (value: string) => {
    if (options.onQueryChange) options.onQueryChange(value);
    else setInternalQuery(value);
    updatePage(1);
  };
  const updateType = (value: SearchDocumentType) => {
    if (options.onTypeChange) options.onTypeChange(value);
    else setInternalType(value);
    updatePage(1);
  };
  return {
    query,
    setQuery: updateQuery,
    type,
    setType: updateType,
    page,
    setPage: updatePage,
    totalPages,
    result,
    select: (item: SearchResultItem) => options.onSelect?.(item)
  };
}
