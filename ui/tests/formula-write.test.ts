import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  writeVarDefault,
  writeVarField,
  writeTopLevel,
  writeDescription,
  addVar,
  removeVar,
  extractDescription,
  formatTomlValue,
} from '../src/lib/formula-write';
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

describe('writeVarField', () => {
  it('updates description within a var section', () => {
    const result = writeVarField(fixture, 'upstream_owner', 'description', 'New description');
    const { vars } = parseFormula(result);
    expect(vars.upstream_owner.description).toBe('New description');
  });

  it('sets required = true (TOML boolean)', () => {
    const result = writeVarField(fixture, 'scope', 'required', true);
    expect(result).toContain('required = true');
    const { vars } = parseFormula(result);
    expect(vars.scope.required).toBe(true);
  });

  it('removes required line when set to false', () => {
    const result = writeVarField(fixture, 'issue', 'required', false);
    const { vars } = parseFormula(result);
    expect(vars.issue.required).toBe(false);
  });

  it('preserves all other var fields after update', () => {
    const result = writeVarField(fixture, 'upstream_owner', 'description', 'Changed');
    const { vars } = parseFormula(result);
    expect(vars.upstream_owner.default).toBe('gastownhall');
    expect(vars.upstream_repo.default).toBe('gascity');
  });
});

describe('writeTopLevel', () => {
  it('updates an existing simple top-level field', () => {
    const result = writeTopLevel(fixture, 'formula', 'my-formula');
    const { header } = parseFormula(result);
    expect(header.formula).toBe('my-formula');
  });

  it('inserts a new top-level field before sections', () => {
    const result = writeTopLevel(fixture, 'contract', 'upstream');
    expect(result).toContain('contract = "upstream"');
    // Must appear before first [section]
    const contractIdx = result.indexOf('contract = "upstream"');
    const firstSection = result.indexOf('\n[');
    expect(contractIdx).toBeLessThan(firstSection);
  });

  it('writes string[] as TOML array', () => {
    const result = writeTopLevel(fixture, 'extends', ['base-formula', 'other']);
    expect(result).toContain('extends = ["base-formula", "other"]');
  });

  it('preserves steps and vars after update', () => {
    const result = writeTopLevel(fixture, 'formula', 'changed');
    const { steps, vars } = parseFormula(result);
    expect(steps.length).toBe(8);
    expect(Object.keys(vars).length).toBe(13);
  });
});

describe('writeDescription', () => {
  it('replaces the existing triple-quoted description', () => {
    const result = writeDescription(fixture, 'Short new description');
    expect(extractDescription(result)).toBe('Short new description');
  });

  it('uses triple-quotes for multi-line values', () => {
    const result = writeDescription(fixture, 'Line one\nLine two');
    expect(result).toContain('description = """');
    expect(extractDescription(result)).toBe('Line one\nLine two');
  });

  it('preserves formula and steps after description change', () => {
    const result = writeDescription(fixture, 'Updated');
    const { header, steps } = parseFormula(result);
    expect(header.formula).toBe('gastownhall-upstream');
    expect(steps.length).toBe(8);
  });
});

describe('extractDescription', () => {
  it('extracts the multi-line triple-quoted description from fixture', () => {
    const desc = extractDescription(fixture);
    expect(desc).toContain('Upstream-submission lifecycle');
    expect(desc.length).toBeGreaterThan(50);
  });

  it('returns empty string when no description exists', () => {
    const src = 'formula = "test"\n\n[vars]\n';
    expect(extractDescription(src)).toBe('');
  });

  it('extracts single-line description', () => {
    const src = 'description = "A simple formula"\nformula = "test"\n';
    expect(extractDescription(src)).toBe('A simple formula');
  });
});

describe('addVar', () => {
  it('adds a new var section after existing vars', () => {
    const result = addVar(fixture, 'new_var');
    expect(result).toContain('[vars.new_var]');
    const { vars } = parseFormula(result);
    expect(vars.new_var).toBeDefined();
  });

  it('preserves existing vars and steps', () => {
    const result = addVar(fixture, 'extra');
    const { vars, steps } = parseFormula(result);
    expect(vars.upstream_owner.default).toBe('gastownhall');
    expect(steps.length).toBe(8);
  });

  it('new var section appears before [[steps]]', () => {
    const result = addVar(fixture, 'new_var');
    const varIdx = result.indexOf('[vars.new_var]');
    const stepsIdx = result.indexOf('[[steps]]');
    expect(varIdx).toBeLessThan(stepsIdx);
  });
});

describe('removeVar', () => {
  it('removes an existing var section', () => {
    const result = removeVar(fixture, 'scope');
    const { vars } = parseFormula(result);
    expect(vars.scope).toBeUndefined();
  });

  it('preserves all other vars and steps', () => {
    const result = removeVar(fixture, 'scope');
    const { vars, steps } = parseFormula(result);
    expect(vars.upstream_owner.default).toBe('gastownhall');
    expect(steps.length).toBe(8);
    expect(Object.keys(vars).length).toBe(12);
  });

  it('returns source unchanged when var not found', () => {
    const result = removeVar(fixture, 'nonexistent');
    expect(result).toBe(fixture);
  });
});
