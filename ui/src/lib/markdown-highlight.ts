import type { Segment } from './formula-highlight';

export type { Segment };

// Highlight inline markdown tokens within a single line of text.
// Returns segments whose text concatenated equals the input line.
function highlightInline(text: string): Segment[] {
  interface Tok { s: number; e: number; cls: string }
  const tokens: Tok[] = [];

  const addIfClear = (s: number, e: number, cls: string) => {
    if (tokens.some(t => s < t.e && e > t.s)) return;
    tokens.push({ s, e, cls });
  };

  // Inline code — highest priority, no nesting
  let m: RegExpExecArray | null;
  const codeRe = /`([^`\n]+)`/g;
  while ((m = codeRe.exec(text)) !== null) {
    tokens.push({ s: m.index, e: m.index + m[0].length, cls: 'md-code' });
  }

  // Bold: **...** or __...__ (checked before italic)
  const strongRe = /(\*\*[^*\n]+\*\*|__[^_\n]+__)/g;
  while ((m = strongRe.exec(text)) !== null) {
    addIfClear(m.index, m.index + m[0].length, 'md-strong');
  }

  // Links: [text](url)
  const linkRe = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
  while ((m = linkRe.exec(text)) !== null) {
    addIfClear(m.index, m.index + m[0].length, 'md-link');
  }

  // Italic: *...* or _..._ (after bold so ** isn't matched as italic)
  const emRe = /(\*[^*\n]+\*|_[^_\n]+_)/g;
  while ((m = emRe.exec(text)) !== null) {
    addIfClear(m.index, m.index + m[0].length, 'md-em');
  }

  tokens.sort((a, b) => a.s - b.s);

  const segs: Segment[] = [];
  let pos = 0;
  for (const tok of tokens) {
    if (tok.s > pos) segs.push({ text: text.slice(pos, tok.s), cls: '' });
    segs.push({ text: text.slice(tok.s, tok.e), cls: tok.cls });
    pos = tok.e;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), cls: '' });

  return segs.length > 0 ? segs : [{ text, cls: '' }];
}

// Highlight markdown source, returning one Segment[] per source line.
// The concatenated text of each line's segments equals the original line.
export function highlightMarkdown(src: string): Segment[][] {
  const lines = src.split('\n');
  let fenced = false;

  return lines.map(line => {
    // Fenced code block fence markers (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      return [{ text: line, cls: 'md-code-fence' }];
    }

    // Inside fenced block
    if (fenced) {
      return [{ text: line, cls: 'md-code' }];
    }

    // ATX headers (# through ######)
    if (/^#{1,6}(\s|$)/.test(line)) {
      return [{ text: line, cls: 'md-h' }];
    }

    // Block quote
    if (/^>/.test(line)) {
      return [{ text: line, cls: 'md-quote' }];
    }

    // List markers: - * or N.
    const listM = line.match(/^(\s*)([-*]|\d+\.)( )(.*)/s);
    if (listM) {
      const segs: Segment[] = [];
      if (listM[1]) segs.push({ text: listM[1], cls: '' });
      segs.push({ text: listM[2] + listM[3], cls: 'md-list' });
      if (listM[4]) segs.push(...highlightInline(listM[4]));
      return segs;
    }

    // Normal text with inline tokens
    return highlightInline(line);
  });
}
