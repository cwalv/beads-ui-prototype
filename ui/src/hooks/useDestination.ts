import { useLocation } from 'react-router-dom';
import type { Destination } from '../types';

export function useDestination(): Destination | null {
  const { pathname } = useLocation();
  if (pathname.startsWith('/author'))  return 'author';
  if (pathname.startsWith('/observe')) return 'observe';
  if (pathname.startsWith('/capture')) return 'capture';
  if (pathname.startsWith('/docs'))    return 'docs';
  return null;
}
