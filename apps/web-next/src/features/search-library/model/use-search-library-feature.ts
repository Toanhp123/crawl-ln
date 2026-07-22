import { useMemo, useState } from 'react';
import {
  useLibrarySearch,
  type SearchDocumentType,
  type SearchResultItem
} from '../../../entities/search';

export function useSearchLibraryFeature(
  options: {
    initialType?: SearchDocumentType;
    pageSize?: number;
    novelId?: string;
    onSelect?: (item: SearchResultItem) => void;
  } = {}
) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchDocumentType>(options.initialType ?? 'all');
  const [page, setPage] = useState(1);
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
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const updateType = (value: SearchDocumentType) => {
    setType(value);
    setPage(1);
  };
  return {
    query,
    setQuery: updateQuery,
    type,
    setType: updateType,
    page,
    setPage,
    totalPages,
    result,
    select: (item: SearchResultItem) => options.onSelect?.(item)
  };
}
