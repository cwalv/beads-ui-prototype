import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFormula, parseValue, findCycles } from '../src/lib/formula-parse';

const fixture = readFileSync(join(__dirname, 'fixtures/gastownhall-upstream.formula.toml'), 'utf8');

describe('parseFormula — gastownhall-upstream fixture', () => {
  it('parses header fields', () => {
    const { header } = parseFormula(fixture);
    expect(header.formula).toBe('gastownhall-upstream');
    expect(header.version).toBe(3);
  });

  it('parses all var sections', () => {
    const { vars } = parseFormula(fixture);
    expect(vars.issue).toBeDefined();
    expect(vars.issue.required).toBe(true);
    expect(vars.issue.default).toBeNull();
    expect(vars.kind.required).toBe(true);
    expect(vars.scope.default).toBe('');
    expect(vars.upstream_owner.default).toBe('gastownhall');
    expect(vars.regression_required.default).toBe('true');
  });

  it('parses all steps with id and title', () => {
    const { steps } = parseFormula(fixture);
    expect(steps.length).toBe(8);
    expect(steps[0].id).toBe('load-context');
    expect(steps[1].id).toBe('validate-worktree');
    expect(steps[7].id).toBe('drain');
  });

  it('parses needs dependencies', () => {
    const { steps } = parseFormula(fixture);
    const validateWorktree = steps.find(s => s.id === 'validate-worktree')!;
    expect(validateWorktree.needs).toEqual(['load-context']);
    const runTests = steps.find(s => s.id === 'run-tests')!;
    expect(runTests.needs).toEqual(['rebuild-integration']);
  });

  it('parses step retry blocks', () => {
    const { steps } = parseFormula(fixture);
    const loadCtx = steps.find(s => s.id === 'load-context')!;
    expect(loadCtx.retry?.max_attempts).toBe(3);
    expect(loadCtx.retry?.on_exhausted).toBe('hard_fail');
  });

  it('parses step metadata inline-tables', () => {
    const { steps } = parseFormula(fixture);
    const loadCtx = steps.find(s => s.id === 'load-context')!;
    expect(loadCtx.metadata['gc.continuation_group']).toBe('upstream-submit');
    expect(loadCtx.metadata['gc.session_affinity']).toBe('require');
  });

  it('produces stepRanges with correct ids', () => {
    const { steps, stepRanges } = parseFormula(fixture);
    const ids = stepRanges.map(r => r.id);
    expect(ids).toEqual(steps.map(s => s.id));
  });

  it('produces no errors for a valid formula', () => {
    const { errors } = parseFormula(fixture);
    expect(errors).toHaveLength(0);
  });
});

describe('parseFormula — edge cases', () => {
  it('reports error for step missing id', () => {
    const src = `\n[[steps]]\ntitle = "no id here"\n`;
    const { errors } = parseFormula(src);
    expect(errors.some(e => e.msg.includes('missing id'))).toBe(true);
  });

  it('reports error for unknown needs reference', () => {
    const src = `\n[[steps]]\nid = "a"\ntitle = "A"\n\n[[steps]]\nid = "b"\ntitle = "B"\nneeds = ["nonexistent"]\n`;
    const { errors } = parseFormula(src);
    expect(errors.some(e => e.msg.includes('needs unknown'))).toBe(true);
  });

  it('detects cycles', () => {
    const src = `\n[[steps]]\nid = "a"\ntitle = "A"\nneeds = ["b"]\n\n[[steps]]\nid = "b"\ntitle = "B"\nneeds = ["a"]\n`;
    const { errors, cycles } = parseFormula(src);
    expect(cycles.length).toBeGreaterThan(0);
    expect(errors.some(e => e.msg.startsWith('cycle:'))).toBe(true);
  });

  it('handles multiline triple-quoted description', () => {
    const src = `description = """\nline one\nline two\n"""\nformula = "test"\n\n[[steps]]\nid = "s1"\ntitle = "Step"\n`;
    const { header, steps, errors } = parseFormula(src);
    expect(header.formula).toBe('test');
    expect(steps[0].id).toBe('s1');
    expect(errors).toHaveLength(0);
  });
});

describe('parseValue', () => {
  it('parses booleans', () => {
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
  });

  it('parses integers', () => {
    expect(parseValue('42')).toBe(42);
    expect(parseValue('-3')).toBe(-3);
  });

  it('parses quoted strings', () => {
    expect(parseValue('"hello"')).toBe('hello');
    expect(parseValue("'world'")).toBe('world');
  });

  it('parses arrays', () => {
    expect(parseValue('["a", "b"]')).toEqual(['a', 'b']);
    expect(parseValue('[]')).toEqual([]);
  });

  it('parses inline tables', () => {
    const result = parseValue('{"key" = "val"}') as Record<string, unknown>;
    expect(result.key).toBe('val');
  });
});

describe('findCycles', () => {
  it('returns empty for acyclic graph', () => {
    const steps = [
      { id: 'a', needs: [], title: null, metadata: {}, retry: null },
      { id: 'b', needs: ['a'], title: null, metadata: {}, retry: null },
    ];
    expect(findCycles(steps)).toHaveLength(0);
  });

  it('detects simple cycle', () => {
    const steps = [
      { id: 'a', needs: ['b'], title: null, metadata: {}, retry: null },
      { id: 'b', needs: ['a'], title: null, metadata: {}, retry: null },
    ];
    expect(findCycles(steps).length).toBeGreaterThan(0);
  });

  it('does not infinite-loop on cycle', () => {
    const steps = [
      { id: 'a', needs: ['a'], title: null, metadata: {}, retry: null },
    ];
    expect(() => findCycles(steps)).not.toThrow();
  });
});
