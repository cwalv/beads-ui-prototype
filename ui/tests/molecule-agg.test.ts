import { describe, it, expect } from 'vitest';
import { computeAgg } from '../src/lib/molecule-agg';
import type { Bead } from '../src/types';

function makeBead(overrides: Partial<Bead> & { id: string }): Bead {
  return {
    title: overrides.id,
    status: 'open',
    priority: 2,
    type: 'task',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStep(id: string, status: Bead['status'], formula = 'my-formula', extra?: Partial<Bead>): Bead {
  return makeBead({
    id,
    status,
    type: 'task',
    metadata: { 'gc.step_ref': `${formula}.${id}`, ...extra?.metadata },
    ...extra,
  });
}

const ROOT = makeBead({
  id: 'mol-1',
  title: 'my-formula',
  status: 'in_progress',
  type: 'molecule',
  metadata: { 'gc.kind': 'workflow' },
});

describe('computeAgg — empty children', () => {
  it('returns zero progress and unknown phase', () => {
    const agg = computeAgg(ROOT, []);
    expect(agg.formula).toBe('my-formula');
    expect(agg.progress).toBe(0);
    expect(agg.currentPhase).toBe('—');
    expect(agg.statusRollup).toBe('running');
    expect(agg.kindBadge).toBe('workflow');
  });
});

describe('computeAgg — all steps closed', () => {
  it('returns 100% progress', () => {
    const steps = [makeStep('s1', 'closed'), makeStep('s2', 'closed'), makeStep('s3', 'closed')];
    const agg = computeAgg(ROOT, steps);
    expect(agg.progress).toBe(1);
    expect(agg.currentPhase).toBe('s3');
  });
});

describe('computeAgg — partial progress', () => {
  it('counts closed vs total', () => {
    const steps = [makeStep('s1', 'closed'), makeStep('s2', 'in_progress'), makeStep('s3', 'open')];
    const agg = computeAgg(ROOT, steps);
    expect(agg.progress).toBeCloseTo(1 / 3);
    expect(agg.currentPhase).toBe('s2');
    expect(agg.statusRollup).toBe('running');
  });
});

describe('computeAgg — blocked', () => {
  it('rolls up blocked', () => {
    const steps = [makeStep('s1', 'closed'), makeStep('s2', 'blocked')];
    const agg = computeAgg(ROOT, steps);
    expect(agg.statusRollup).toBe('blocked');
  });
});

describe('computeAgg — at-gate', () => {
  it('detects in-progress gate bead', () => {
    const gate = makeBead({ id: 'g1', status: 'in_progress', type: 'gate' });
    const agg = computeAgg(ROOT, [makeStep('s1', 'closed'), gate]);
    expect(agg.statusRollup).toBe('at-gate');
  });
});

describe('computeAgg — retry', () => {
  it('reads attempt/max_attempts metadata', () => {
    const retryStep = makeStep('s2', 'in_progress', 'my-formula', {
      metadata: {
        'gc.step_ref': 'my-formula.s2',
        'gc.attempt': 2,
        'gc.max_attempts': 3,
      },
    });
    const agg = computeAgg(ROOT, [makeStep('s1', 'closed'), retryStep]);
    expect(agg.statusRollup).toBe('retry');
    expect(agg.retryDisplay).toBe('retry 2/3');
  });
});

describe('computeAgg — excludes pseudo-steps from progress', () => {
  it('skips attempt.N and spec steps', () => {
    const real1 = makeStep('s1', 'closed');
    const real2 = makeStep('s2', 'in_progress');
    const pseudoAttempt = makeBead({
      id: 'at1',
      status: 'closed',
      metadata: { 'gc.step_ref': 'my-formula.s1.attempt.1' },
    });
    const pseudoSpec = makeBead({
      id: 'sp1',
      status: 'closed',
      metadata: { 'gc.step_ref': 'my-formula.s1.spec' },
    });
    const agg = computeAgg(ROOT, [real1, real2, pseudoAttempt, pseudoSpec]);
    // 2 real steps, 1 closed → 0.5
    expect(agg.progress).toBeCloseTo(0.5);
  });
});
