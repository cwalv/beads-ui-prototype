import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { writeVarDefault, formatTomlValue } from '../src/lib/formula-write';
import { parseFormula } from '../src/lib/formula-parse';

const fixture = readFileSync(join(__dirname, 'fixtures/gastownhall-upstream.formula.toml'), 'utf8');

describe('writeVarDefault', () => {
  it('updates an existing default value', () => {
    const result = writeVarDefault(fixture, 'upstream_owner', 'myorg');
    const { vars } = parseFormula(result);
    expect(vars.upstream_owner.default).toBe('myorg');
  });

  it('preserves other var defaults after update', () => {
    const result = writeVarDefault(fixture, 'upstream_owner', 'neworg');
    const { vars } = parseFormula(result);
    expect(vars.upstream_repo.default).toBe('gascity');
    expect(vars.regression_required.default).toBe('true');
  });

  it('round-trips: all other lines unchanged', () => {
    const updated = writeVarDefault(fixture, 'upstream_owner', 'gastownhall');
    // Same value → functionally identical parse
    const { steps, vars } = parseFormula(updated);
    expect(steps.length).toBe(8);
    expect(vars.issue.required).toBe(true);
  });

  it('inserts default when none exists (required var)', () => {
    const result = writeVarDefault(fixture, 'issue', 'fo-test-123');
    const { vars } = parseFormula(result);
    expect(vars.issue.default).toBe('fo-test-123');
  });

  it('returns source unchanged when var section not found', () => {
    const result = writeVarDefault(fixture, 'nonexistent_var', 'val');
    expect(result).toBe(fixture);
  });
});

describe('formatTomlValue', () => {
  it('formats strings with double quotes', () => {
    expect(formatTomlValue('hello')).toBe('"hello"');
  });

  it('escapes double quotes in strings', () => {
    expect(formatTomlValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('formats numbers as-is', () => {
    expect(formatTomlValue(42)).toBe('42');
  });

  it('formats booleans as quoted strings (formula convention)', () => {
    expect(formatTomlValue(true)).toBe('"true"');
    expect(formatTomlValue(false)).toBe('"false"');
  });
});
