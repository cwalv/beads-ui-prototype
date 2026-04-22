import { createContext, useContext, useEffect } from 'react';

export interface FooterContent {
  left: string;
  right: string;
}

export interface FooterAPI {
  content: FooterContent;
  setContent: (c: FooterContent) => void;
}

export const FooterContext = createContext<FooterAPI | null>(null);

export function useSetFooter(left: string, right: string): void {
  const ctx = useContext(FooterContext);
  if (!ctx) return;
  const { setContent } = ctx;
  useEffect(() => {
    setContent({ left, right });
  }, [left, right, setContent]);
}
