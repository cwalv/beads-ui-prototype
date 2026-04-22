import { Navigate, useSearchParams } from 'react-router-dom';

export default function ObserveIndex() {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`/observe/fleet${search ? `?${search}` : ''}`} replace />;
}
