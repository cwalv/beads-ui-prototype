// Syntax highlighter for formula TOML overlay rendering.
// Returns line segments with CSS class names for colorizing.

export interface Segment {
  text: string;
  cls: string;
}

export function highlightLines(src: string): Segment[][] {
  const lines = src.split('\n');
  let inTriple = false;
  return lines.map(line => {
    if (inTriple) {
      if (/"""|'''/.test(line)) inTriple = false;
      return [{ text: line, cls: 't-com' }];
    }
    if (/"""|'''/.test(line) && !line.match(/""".*"""|'''.*'''/)) {
      inTriple = true;
      return [{ text: line, cls: 't-com' }];
    }
    const segs: Segment[] = [];
    const hashIdx = findUnquotedHash(line);
    const code = hashIdx === -1 ? line : line.slice(0, hashIdx);
    const comment = hashIdx === -1 ? '' : line.slice(hashIdx);

    if (/^\s*\[/.test(code)) {
      segs.push({ text: code, cls: 't-sec' });
      if (comment) segs.push({ text: comment, cls: 't-com' });
      return segs;
    }

    const m = code.match(/^(\s*)([A-Za-z_][A-Za-z0-9_\-.]*)(\s*=\s*)(.*)$/);
    if (m) {
      if (m[1]) segs.push({ text: m[1], cls: '' });
      segs.push({ text: m[2], cls: 't-key' });
      segs.push({ text: m[3], cls: 't-op' });
      segs.push(...highlightValue(m[4]));
      if (comment) segs.push({ text: comment, cls: 't-com' });
      return segs;
    }

    segs.push({ text: code, cls: '' });
    if (comment) segs.push({ text: comment, cls: 't-com' });
    return segs;
  });
}

export function findUnquotedHash(line: string): number {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) { if (c === inStr && line[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '#') return i;
  }
  return -1;
}

export function highlightValue(v: string): Segment[] {
  const out: Segment[] = [];
  const rest = v;

  const strM = rest.match(/^"([^"\\]|\\.)*"/);
  if (strM) {
    const str = strM[0];
    const parts = str.split(/(\{\{[^}]+\}\})/);
    parts.forEach(p => {
      if (/^\{\{/.test(p)) out.push({ text: p, cls: 't-var' });
      else out.push({ text: p, cls: 't-str' });
    });
    out.push({ text: rest.slice(strM[0].length), cls: '' });
    return out;
  }
  if (/^(true|false)\b/.test(rest)) {
    const m = rest.match(/^(true|false)/);
    if (m) {
      out.push({ text: m[0], cls: 't-bool' });
      out.push({ text: rest.slice(m[0].length), cls: '' });
    }
    return out;
  }
  if (/^-?\d/.test(rest)) {
    const m = rest.match(/^-?[\d.]+/);
    if (m) {
      out.push({ text: m[0], cls: 't-num' });
      out.push({ text: rest.slice(m[0].length), cls: '' });
    }
    return out;
  }
  if (rest.startsWith('[') || rest.startsWith('{')) {
    const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|(true|false)\b|(-?\d+(?:\.\d+)?)\b/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(rest)) !== null) {
      if (match.index > last) out.push({ text: rest.slice(last, match.index), cls: '' });
      const tok = match[0];
      if (/^"|^'/.test(tok)) {
        const parts = tok.split(/(\{\{[^}]+\}\})/);
        parts.forEach(p => {
          if (/^\{\{/.test(p)) out.push({ text: p, cls: 't-var' });
          else out.push({ text: p, cls: 't-str' });
        });
      } else if (/^(true|false)/.test(tok)) {
        out.push({ text: tok, cls: 't-bool' });
      } else {
        out.push({ text: tok, cls: 't-num' });
      }
      last = match.index + tok.length;
    }
    if (last < rest.length) out.push({ text: rest.slice(last), cls: '' });
    return out;
  }

  out.push({ text: rest, cls: '' });
  return out;
}
