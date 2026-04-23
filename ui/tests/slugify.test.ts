import { describe, it, expect } from 'vitest';
import { slugifyHeading } from '../src/lib/slugify';

describe('slugifyHeading', () => {
  it('slugifies a plain heading', () => {
    expect(slugifyHeading('Using bd ready')).toBe('using-bd-ready');
  });

  it('strips backtick markers (raw markdown input)', () => {
    expect(slugifyHeading('Using `bd ready`')).toBe('using-bd-ready');
  });

  it('strips bold markers (raw markdown input)', () => {
    expect(slugifyHeading('**Important** notes')).toBe('important-notes');
  });

  it('strips HTML tags (marked-rendered input)', () => {
    expect(slugifyHeading('Using <code>bd ready</code>')).toBe('using-bd-ready');
  });

  it('strips HTML bold tags (marked-rendered input)', () => {
    expect(slugifyHeading('<strong>Important</strong> notes')).toBe('important-notes');
  });
});
