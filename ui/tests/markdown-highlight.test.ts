import { describe, it, expect } from 'vitest';
import { highlightMarkdown } from '../src/lib/markdown-highlight';

// Helper: extract all cls values from a line
const classes = (line: ReturnType<typeof highlightMarkdown>[number]) =>
  line.map(s => s.cls).filter(Boolean);

// Helper: concatenated text must equal original line
const text = (line: ReturnType<typeof highlightMarkdown>[number]) =>
  line.map(s => s.text).join('');

describe('highlightMarkdown — block-level tokens', () => {
  it('highlights ATX headers with md-h', () => {
    const lines = highlightMarkdown('# Hello');
    expect(classes(lines[0])).toContain('md-h');
  });

  it('highlights level-2 headers with md-h', () => {
    const lines = highlightMarkdown('## Section');
    expect(classes(lines[0])).toContain('md-h');
  });

  it('highlights fenced code block fence line with md-code-fence', () => {
    const lines = highlightMarkdown('```bash\necho hi\n```');
    expect(classes(lines[0])).toContain('md-code-fence');
  });

  it('highlights fenced code block content with md-code', () => {
    const lines = highlightMarkdown('```bash\necho hi\n```');
    expect(classes(lines[1])).toContain('md-code');
  });

  it('highlights closing fence with md-code-fence', () => {
    const lines = highlightMarkdown('```\nfoo\n```');
    expect(classes(lines[2])).toContain('md-code-fence');
  });

  it('supports tilde fences', () => {
    const lines = highlightMarkdown('~~~\ncode\n~~~');
    expect(classes(lines[0])).toContain('md-code-fence');
    expect(classes(lines[1])).toContain('md-code');
  });

  it('highlights block quotes with md-quote', () => {
    const lines = highlightMarkdown('> this is a quote');
    expect(classes(lines[0])).toContain('md-quote');
  });

  it('highlights unordered list markers with md-list', () => {
    const lines = highlightMarkdown('- item');
    expect(classes(lines[0])).toContain('md-list');
  });

  it('highlights * list markers with md-list', () => {
    const lines = highlightMarkdown('* item');
    expect(classes(lines[0])).toContain('md-list');
  });

  it('highlights ordered list markers with md-list', () => {
    const lines = highlightMarkdown('1. item');
    expect(classes(lines[0])).toContain('md-list');
  });

  it('preserves indented list marker text', () => {
    const lines = highlightMarkdown('  - indented');
    expect(text(lines[0])).toBe('  - indented');
  });
});

describe('highlightMarkdown — inline tokens', () => {
  it('highlights inline code with md-code', () => {
    const lines = highlightMarkdown('use `var` here');
    expect(classes(lines[0])).toContain('md-code');
  });

  it('highlights bold ** with md-strong', () => {
    const lines = highlightMarkdown('this is **bold** text');
    expect(classes(lines[0])).toContain('md-strong');
  });

  it('highlights bold __ with md-strong', () => {
    const lines = highlightMarkdown('__bold__');
    expect(classes(lines[0])).toContain('md-strong');
  });

  it('highlights italic * with md-em', () => {
    const lines = highlightMarkdown('*italic*');
    expect(classes(lines[0])).toContain('md-em');
  });

  it('highlights italic _ with md-em', () => {
    const lines = highlightMarkdown('_italic_');
    expect(classes(lines[0])).toContain('md-em');
  });

  it('highlights links with md-link', () => {
    const lines = highlightMarkdown('[example](https://example.com)');
    expect(classes(lines[0])).toContain('md-link');
  });

  it('does not treat ** as italic', () => {
    const lines = highlightMarkdown('**bold**');
    expect(classes(lines[0])).not.toContain('md-em');
    expect(classes(lines[0])).toContain('md-strong');
  });

  it('inline code takes priority over bold markers', () => {
    const lines = highlightMarkdown('`**not bold**`');
    expect(classes(lines[0])).toContain('md-code');
    expect(classes(lines[0])).not.toContain('md-strong');
  });
});

describe('highlightMarkdown — text preservation', () => {
  it('concatenated segment text equals the source line', () => {
    const src = '# Header\n- list item\n**bold** and `code`\n> quote\n```\ncode\n```\n';
    const lines = highlightMarkdown(src);
    const srcLines = src.split('\n');
    lines.forEach((line, i) => {
      expect(text(line)).toBe(srcLines[i]);
    });
  });

  it('returns one array per source line', () => {
    const src = 'line1\nline2\nline3';
    const lines = highlightMarkdown(src);
    expect(lines.length).toBe(3);
  });

  it('handles empty string without throwing', () => {
    expect(() => highlightMarkdown('')).not.toThrow();
  });

  it('handles plain text (no tokens) without throwing', () => {
    const lines = highlightMarkdown('just plain text');
    expect(text(lines[0])).toBe('just plain text');
  });
});
