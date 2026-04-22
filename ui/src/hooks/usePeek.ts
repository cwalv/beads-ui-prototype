import { useSearchParams } from 'react-router-dom';

export function usePeek() {
  const [searchParams, setSearchParams] = useSearchParams();
  const peekId = searchParams.get('peek') ?? null;

  const open = (id: string) => setSearchParams({ peek: id }, { replace: false });
  const close = () => setSearchParams({}, { replace: false });

  return { peekId, open, close };
}
