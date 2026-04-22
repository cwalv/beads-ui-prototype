import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { FooterContext } from '../src/hooks/useSetFooter';
import { FootBar } from '../src/components/chrome/FootBar';
import { useSetFooter } from '../src/hooks/useSetFooter';
import type { FooterContent } from '../src/hooks/useSetFooter';

function DestinationStub({ left, right }: { left: string; right: string }) {
  useSetFooter(left, right);
  return <div>destination</div>;
}

function TestHarness({ left, right }: { left: string; right: string }) {
  const [content, setContent] = useState<FooterContent>({ left: '', right: '' });
  return (
    <FooterContext.Provider value={{ content, setContent }}>
      <DestinationStub left={left} right={right} />
      <FootBar />
    </FooterContext.Provider>
  );
}

describe('useSetFooter', () => {
  it('destination sets footer content rendered by FootBar', () => {
    render(<TestHarness left="left content" right="right content" />);
    expect(screen.getByText('left content')).toBeTruthy();
    expect(screen.getByText('right content')).toBeTruthy();
  });
});
