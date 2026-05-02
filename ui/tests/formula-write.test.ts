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
  extractStepDescription,
  writeStepField,
  renameStepId,
  addStep,
  removeStep,
  moveStep,
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

// ── Step helper tests ──

const STEP_SRC = `formula = "test"
version = 1

[[steps]]
id = "fetch"
title = "Fetch things"
description = """
Multi-line
description here.
"""
needs = []

[[steps]]
id = "process"
title = "Process output"
needs = ["fetch"]

[steps.retry]
max_attempts = 3
on_exhausted = "hard_fail"

[[steps]]
id = "publish"
title = "Publish results"
needs = ["fetch", "process"]
metadata = { "gc.routed_to" = "pool" }
`;

describe('extractStepDescription', () => {
  it('extracts triple-quoted multi-line description', () => {
    const desc = extractStepDescription(STEP_SRC, 0);
    expect(desc).toContain('Multi-line');
    expect(desc).toContain('description here.');
  });

  it('returns empty string when step has no description', () => {
    expect(extractStepDescription(STEP_SRC, 1)).toBe('');
  });

  it('returns empty string for out-of-bounds index', () => {
    expect(extractStepDescription(STEP_SRC, 99)).toBe('');
  });
});

describe('writeStepField — simple fields', () => {
  it('updates title of a step', () => {
    const result = writeStepField(STEP_SRC, 0, 'title', 'New title');
    const { steps } = parseFormula(result);
    expect(steps[0].title).toBe('New title');
    expect(steps[1].title).toBe('Process output');
  });

  it('inserts title when not present', () => {
    const src = `formula = "t"\n\n[[steps]]\nid = "a"\n`;
    const result = writeStepField(src, 0, 'title', 'Added title');
    const { steps } = parseFormula(result);
    expect(steps[0].title).toBe('Added title');
  });

  it('does not mutate other steps', () => {
    const result = writeStepField(STEP_SRC, 1, 'title', 'Changed');
    const { steps } = parseFormula(result);
    expect(steps[0].title).toBe('Fetch things');
    expect(steps[2].title).toBe('Publish results');
  });
});

describe('writeStepField — description', () => {
  it('replaces existing multi-line description', () => {
    const result = writeStepField(STEP_SRC, 0, 'description', 'Short new');
    expect(extractStepDescription(result, 0)).toBe('Short new');
  });

  it('writes triple-quoted for multi-line description', () => {
    const result = writeStepField(STEP_SRC, 0, 'description', 'Line 1\nLine 2');
    expect(result).toContain('description = """');
    expect(extractStepDescription(result, 0)).toBe('Line 1\nLine 2');
  });

  it('inserts description when not present', () => {
    const result = writeStepField(STEP_SRC, 1, 'description', 'Added');
    expect(extractStepDescription(result, 1)).toBe('Added');
  });

  it('does not affect other steps', () => {
    const result = writeStepField(STEP_SRC, 1, 'description', 'For step 2');
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('fetch');
    expect(steps[2].id).toBe('publish');
  });
});

describe('writeStepField — needs', () => {
  it('updates needs array', () => {
    const result = writeStepField(STEP_SRC, 2, 'needs', ['fetch']);
    const { steps } = parseFormula(result);
    expect(steps[2].needs).toEqual(['fetch']);
  });

  it('clears needs array', () => {
    const result = writeStepField(STEP_SRC, 1, 'needs', []);
    const { steps } = parseFormula(result);
    expect(steps[1].needs).toEqual([]);
  });

  it('inserts needs when not present', () => {
    const src = `formula = "t"\n\n[[steps]]\nid = "a"\n`;
    const result = writeStepField(src, 0, 'needs', ['b']);
    const { steps } = parseFormula(result);
    expect(steps[0].needs).toEqual(['b']);
  });
});

describe('writeStepField — retry fields', () => {
  it('updates max_attempts in existing retry section', () => {
    const result = writeStepField(STEP_SRC, 1, 'max_attempts', 5);
    const { steps } = parseFormula(result);
    expect(steps[1].retry?.max_attempts).toBe(5);
  });

  it('updates on_exhausted in existing retry section', () => {
    const result = writeStepField(STEP_SRC, 1, 'on_exhausted', 'soft_fail');
    const { steps } = parseFormula(result);
    expect(steps[1].retry?.on_exhausted).toBe('soft_fail');
  });

  it('creates [steps.retry] section when absent', () => {
    const result = writeStepField(STEP_SRC, 0, 'max_attempts', 2);
    const { steps } = parseFormula(result);
    expect(steps[0].retry?.max_attempts).toBe(2);
  });

  it('does not affect retry on other steps', () => {
    const result = writeStepField(STEP_SRC, 0, 'max_attempts', 2);
    const { steps } = parseFormula(result);
    expect(steps[1].retry?.max_attempts).toBe(3);
  });
});

describe('renameStepId', () => {
  it('renames the id field', () => {
    const result = renameStepId(STEP_SRC, 'fetch', 'fetch-data');
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('fetch-data');
  });

  it('rewrites all needs references', () => {
    const result = renameStepId(STEP_SRC, 'fetch', 'fetch-data');
    const { steps } = parseFormula(result);
    expect(steps[1].needs).toContain('fetch-data');
    expect(steps[1].needs).not.toContain('fetch');
    expect(steps[2].needs).toContain('fetch-data');
    expect(steps[2].needs).not.toContain('fetch');
  });

  it('returns source unchanged when id not found', () => {
    const result = renameStepId(STEP_SRC, 'nonexistent', 'new-id');
    expect(result).toBe(STEP_SRC);
  });

  it('returns source unchanged when old === new', () => {
    const result = renameStepId(STEP_SRC, 'fetch', 'fetch');
    expect(result).toBe(STEP_SRC);
  });

  it('preserves all other steps and vars', () => {
    const result = renameStepId(STEP_SRC, 'process', 'transform');
    const { steps } = parseFormula(result);
    expect(steps.length).toBe(3);
    expect(steps[0].id).toBe('fetch');
    expect(steps[1].id).toBe('transform');
    expect(steps[2].needs).toContain('transform');
  });
});

describe('addStep', () => {
  it('appends a new step at end by default', () => {
    const result = addStep(STEP_SRC, { id: 'notify' });
    const { steps } = parseFormula(result);
    expect(steps.length).toBe(4);
    expect(steps[3].id).toBe('notify');
  });

  it('inserts step after given index', () => {
    const result = addStep(STEP_SRC, { id: 'validate', afterIndex: 0 });
    const { steps } = parseFormula(result);
    expect(steps.length).toBe(4);
    expect(steps[1].id).toBe('validate');
  });

  it('includes title when provided', () => {
    const result = addStep(STEP_SRC, { id: 'notify', title: 'Send notification' });
    const { steps } = parseFormula(result);
    expect(steps[3].title).toBe('Send notification');
  });

  it('preserves existing steps', () => {
    const result = addStep(STEP_SRC, { id: 'extra' });
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('fetch');
    expect(steps[1].id).toBe('process');
    expect(steps[2].id).toBe('publish');
  });
});

describe('removeStep', () => {
  it('removes the step block', () => {
    const result = removeStep(STEP_SRC, 1);
    const { steps } = parseFormula(result);
    expect(steps.length).toBe(2);
    expect(steps.find(s => s.id === 'process')).toBeUndefined();
  });

  it('scrubs removed id from other needs', () => {
    const result = removeStep(STEP_SRC, 1);
    const { steps } = parseFormula(result);
    const publish = steps.find(s => s.id === 'publish');
    expect(publish?.needs).not.toContain('process');
  });

  it('preserves steps not involved in the removal', () => {
    const result = removeStep(STEP_SRC, 1);
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('fetch');
    expect(steps[1].id).toBe('publish');
  });

  it('returns source unchanged for out-of-bounds index', () => {
    const result = removeStep(STEP_SRC, 99);
    expect(result).toBe(STEP_SRC);
  });
});

describe('moveStep', () => {
  it('moves a step forward', () => {
    const result = moveStep(STEP_SRC, 0, 2);
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('process');
    expect(steps[1].id).toBe('publish');
    expect(steps[2].id).toBe('fetch');
  });

  it('moves a step backward', () => {
    const result = moveStep(STEP_SRC, 2, 0);
    const { steps } = parseFormula(result);
    expect(steps[0].id).toBe('publish');
    expect(steps[1].id).toBe('fetch');
    expect(steps[2].id).toBe('process');
  });

  it('returns source unchanged when from === to', () => {
    const result = moveStep(STEP_SRC, 1, 1);
    expect(result).toBe(STEP_SRC);
  });

  it('preserves all step ids after move', () => {
    const result = moveStep(STEP_SRC, 0, 1);
    const { steps } = parseFormula(result);
    expect(steps.map(s => s.id)).toContain('fetch');
    expect(steps.map(s => s.id)).toContain('process');
    expect(steps.map(s => s.id)).toContain('publish');
  });
});
