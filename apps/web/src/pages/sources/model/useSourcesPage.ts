import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SourcesSection = 'plugins' | 'credentials' | 'network' | 'challenges' | 'inspector';

const sections = new Set<SourcesSection>([
  'plugins',
  'credentials',
  'network',
  'challenges',
  'inspector'
]);

export function useSourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('section');
  const section: SourcesSection =
    raw && sections.has(raw as SourcesSection) ? (raw as SourcesSection) : 'plugins';

  useEffect(() => {
    if (raw && !sections.has(raw as SourcesSection)) {
      const next = new URLSearchParams(searchParams);
      next.set('section', 'plugins');
      setSearchParams(next, { replace: true });
    }
  }, [raw, searchParams, setSearchParams]);

  const setSection = (nextSection: SourcesSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', nextSection);
    setSearchParams(next);
  };

  return { section, setSection };
}
