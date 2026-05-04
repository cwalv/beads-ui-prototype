import { describe, it, expect } from 'vitest';
import { computeAgg, gascityPack } from '../../../src/conventions';
import type { Bead } from '../../../src/types';
import type { PackDriver } from '../../../src/conventions';

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

describe('gascityPack — capabilities and detect', () => {
  it('claims molecule graph and formula instances support', () => {
    expect(gascityPack.name).toBe('gascity');
    expect(gascityPack.capabilities.moleculeGraph).toBe(true);
    expect(gascityPack.capabilities.formulaInstances).toBe(true);
  });

  it('detect returns true for any workspace (v1 default)', () => {
    expect(gascityPack.detect({ name: 'w', path: '/x', reachable: true })).toBe(true);
  });
});

describe('gascityPack — badgeRules', () => {
  it('emits a continuation-group chip when gc.continuation_group is set', () => {
    const rule = gascityPack.badgeRules.find(r => r.conceptKey === 'continuation-group')!;
    expect(rule.apply({ 'gc.continuation_group': 'lane-a' })).toEqual({
      label: '⎇ lane-a',
      tone: 'info',
    });
    expect(rule.apply({})).toBeNull();
  });

  it('emits a session-affinity chip only when gc.session_affinity === "require"', () => {
    const rule = gascityPack.badgeRules.find(r => r.conceptKey === 'session-affinity')!;
    expect(rule.apply({ 'gc.session_affinity': 'require' })).toEqual({
      label: '📌 session',
      tone: 'info',
    });
    expect(rule.apply({ 'gc.session_affinity': 'prefer' })).toBeNull();
    expect(rule.apply({})).toBeNull();
  });
});

describe('gascityPack — listFleetItems', () => {
  function makeDriver(routes: Map<string, unknown>): PackDriver {
    return {
      async fetch<T>(args: string[]): Promise<T> {
        const key = args.join(' ');
        if (!routes.has(key)) throw new Error(`unexpected fetch: ${key}`);
        return routes.get(key) as T;
      },
    };
  }

  it('shapes a single in-progress molecule into a FleetItem', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      metadata: { 'gc.kind': 'workflow' },
      updated_at: '2026-04-01T00:00:00Z',
    });
    const child = makeStep('s1', 'in_progress');
    const fullRoot: Bead = { ...root, dependencies: [{ id: 's1', dep_type: 'parent-child' } as never] };

    const driver = makeDriver(new Map<string, unknown>([
      ['list --type=molecule --status=in_progress --json', [root]],
      ['show mol-1 --json', fullRoot],
      ['show s1 --json', child],
    ]));

    const items = await gascityPack.listFleetItems({ driver, workspace: 'ws-a' });
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.id).toBe('mol-1');
    expect(item.title).toBe('my-formula');
    expect(item.primaryLabel).toBe('◐ running');
    expect(item.primaryTone).toBe('info');
    expect(item.progress).toBe(0);
    expect(item.badges).toEqual([{ label: 'workflow', tone: 'neutral' }]);
    expect(item.updatedAt).toBe('2026-04-01T00:00:00Z');
  });

  it('reuses cache entries when updatedAt matches', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      updated_at: '2026-04-01T00:00:00Z',
    });
    const driver = makeDriver(new Map<string, unknown>([
      ['list --type=molecule --status=in_progress --json', [root]],
    ]));
    const cached = {
      id: 'mol-1',
      title: 'my-formula',
      primaryLabel: '◐ running',
      primaryTone: 'info' as const,
      progress: 0.42,
      badges: [],
      createdAt: '',
      updatedAt: '2026-04-01T00:00:00Z',
      packData: { agg: { formula: 'my-formula', currentPhase: 's2', progress: 0.42, statusRollup: 'running' as const, retryDisplay: null, kindBadge: null } },
    };
    const items = await gascityPack.listFleetItems({ driver, workspace: 'ws-a', prev: [cached] });
    expect(items[0]).toBe(cached);
  });
});

describe('gascityPack — getMoleculeEvents', () => {
  function makeDriver(routes: Map<string, unknown>): PackDriver {
    return {
      async fetch<T>(args: string[]): Promise<T> {
        const key = args.join(' ');
        if (!routes.has(key)) throw new Error(`unexpected fetch: ${key}`);
        return routes.get(key) as T;
      },
    };
  }

  it('emits bead.created for root with no children', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      created_at: '2026-04-01T00:00:00Z',
      dependencies: [],
    });
    const driver = makeDriver(new Map([['show mol-1 --json', root]]));
    const events = await gascityPack.getMoleculeEvents('mol-1', { driver, workspace: 'ws-a' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const created = events.find(e => e.type === 'bead.created');
    expect(created).toBeDefined();
    expect(created!.beadId).toBe('mol-1');
    expect(created!.source).toBe('bd');
    expect(created!.timestamp).toBe('2026-04-01T00:00:00Z');
    expect(created!.display.label).toContain('molecule created');
  });

  it('emits bead.started when started_at is set', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      created_at: '2026-04-01T00:00:00Z',
      started_at: '2026-04-01T01:00:00Z',
      dependencies: [],
    } as Partial<Bead> & { id: string });
    const driver = makeDriver(new Map([['show mol-1 --json', root]]));
    const events = await gascityPack.getMoleculeEvents('mol-1', { driver, workspace: 'ws-a' });
    const started = events.find(e => e.type === 'bead.started');
    expect(started).toBeDefined();
    expect(started!.timestamp).toBe('2026-04-01T01:00:00Z');
    expect(started!.display.label).toContain('started');
  });

  it('emits bead.closed for closed step using updated_at as fallback', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      created_at: '2026-04-01T00:00:00Z',
      dependencies: [{ id: 's1' } as never],
    });
    const step = makeStep('s1', 'closed', 'my-formula');
    // step has no closed_at, uses updated_at fallback
    const driver = makeDriver(new Map([
      ['show mol-1 --json', root],
      ['show s1 --json', step],
    ]));
    const events = await gascityPack.getMoleculeEvents('mol-1', { driver, workspace: 'ws-a' });
    const closed = events.find(e => e.type === 'bead.closed');
    expect(closed).toBeDefined();
    expect(closed!.beadId).toBe('s1');
    expect(closed!.display.label).toContain('step closed');
  });

  it('emits comment.added events', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      created_at: '2026-04-01T00:00:00Z',
      dependencies: [],
      comments: [
        {
          id: 'c1',
          issue_id: 'mol-1',
          author: 'alice',
          text: 'looks good',
          created_at: '2026-04-01T02:00:00Z',
        },
      ],
    } as Partial<Bead> & { id: string });
    const driver = makeDriver(new Map([['show mol-1 --json', root]]));
    const events = await gascityPack.getMoleculeEvents('mol-1', { driver, workspace: 'ws-a' });
    const comment = events.find(e => e.type === 'comment.added');
    expect(comment).toBeDefined();
    expect(comment!.timestamp).toBe('2026-04-01T02:00:00Z');
    expect(comment!.display.label).toContain('alice');
    expect(comment!.display.label).toContain('looks good');
    expect(comment!.payload).toMatchObject({ author: 'alice', text: 'looks good' });
  });

  it('returns events in chronological order', async () => {
    const root = makeBead({
      id: 'mol-1',
      title: 'my-formula',
      status: 'in_progress',
      type: 'molecule',
      created_at: '2026-04-01T00:00:00Z',
      dependencies: [{ id: 's1' } as never],
    });
    const step = makeStep('s1', 'in_progress', 'my-formula');
    // step was created before root's updated_at
    const stepWithTs = { ...step, created_at: '2026-04-01T00:30:00Z' };
    const driver = makeDriver(new Map([
      ['show mol-1 --json', root],
      ['show s1 --json', stepWithTs],
    ]));
    const events = await gascityPack.getMoleculeEvents('mol-1', { driver, workspace: 'ws-a' });
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp >= events[i - 1].timestamp).toBe(true);
    }
  });
});
