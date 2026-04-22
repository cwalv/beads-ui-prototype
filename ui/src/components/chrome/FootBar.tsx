import { useContext } from 'react';
import { FooterContext } from '../../hooks/useSetFooter';

export function FootBar() {
  const ctx = useContext(FooterContext);
  const left = ctx?.content.left ?? '';
  const right = ctx?.content.right ?? '';

  return (
    <footer className="foot-bar">
      <span>{left}</span>
      <span className="fb-spacer" />
      <span>{right}</span>
    </footer>
  );
}
