import { Navigate, useSearchParams } from 'react-router-dom';

export default function AuthorIndex() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`/author/browse${search ? `?${search}` : ''}`} replace />;
}
