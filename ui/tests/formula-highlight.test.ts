import { describe, it, expect } from 'vitest';
import { highlightLines, findUnquotedHash, highlightValue } from '../src/lib/formula-highlight';

describe('highlightLines', () => {
  it('marks section headers with t-sec', () => {
    const lines = highlightLines('[[steps]]');
    expect(lines[0].some(s => s.cls === 't-sec')).toBe(true);
  });

  it('marks keys with t-key', () => {
    const lines = highlightLines('id = "foo"');
    expect(lines[0].some(s => s.cls === 't-key' && s.text === 'id')).toBe(true);
  });

  it('marks string values with t-str', () => {
    const lines = highlightLines('id = "foo"');
    expect(lines[0].some(s => s.cls === 't-str')).toBe(true);
  });

  it('marks comments with t-com', () => {
    const lines = highlightLines('# a comment');
    expect(lines[0].some(s => s.cls === 't-com')).toBe(true);
  });

  it('marks inline comments with t-com', () => {
    const lines = highlightLines('key = "val" # comment');
    expect(lines[0].some(s => s.cls === 't-com')).toBe(true);
  });

  it('marks boolean values with t-bool', () => {
    const lines = highlightLines('required = true');
    expect(lines[0].some(s => s.cls === 't-bool')).toBe(true);
  });

  it('marks {{var}} tokens inside strings with t-var', () => {
    const lines = highlightLines('title = "Ship {{issue}}"');
    expect(lines[0].some(s => s.cls === 't-var')).toBe(true);
  });

  it('handles triple-quoted blocks as comments', () => {
    const src = 'description = """\nline1\n"""';
    const lines = highlightLines(src);
    // Line 1 (inside triple) should have t-com
    expect(lines[1].some(s => s.cls === 't-com')).toBe(true);
  });

  it('handles multiple lines without throwing', () => {
    const src = 'a = 1\nb = "hello"\nc = true\n[[steps]]\nid = "x"\n';
    expect(() => highlightLines(src)).not.toThrow();
  });
});

describe('findUnquotedHash', () => {
  it('finds hash in plain text', () => {
    expect(findUnquotedHash('hello # comment')).toBe(6);
  });

  it('ignores hash inside quoted string', () => {
    expect(findUnquotedHash('"#inside" # out')).toBe(10);
  });

  it('returns -1 when no unquoted hash', () => {
    expect(findUnquotedHash('key = "value"')).toBe(-1);
  });
});

describe('highlightValue', () => {
  it('classifies string with t-str', () => {
    const segs = highlightValue('"hello"');
    expect(segs.some(s => s.cls === 't-str')).toBe(true);
  });

  it('classifies boolean with t-bool', () => {
    expect(highlightValue('true').some(s => s.cls === 't-bool')).toBe(true);
  });

  it('classifies number with t-num', () => {
    expect(highlightValue('42').some(s => s.cls === 't-num')).toBe(true);
  });
});
