// Gascity orchestrator pack. Knows about gc.* metadata keys, molecule
// step-ref structure, and the StatusRollup invention. Extracted here from
// (formerly) ui/src/lib/molecule-agg.ts, ui/src/components/editor/DAG.tsx
// chip rules, and ui/src/client/formula.ts gc.formula query.

import type { Bead } from '../../types';
import type {
  Badge,
  BadgeRule,
  BadgeTone,
  FleetItem,
  FormulaInstanceItem,
  KeyDisplayMap,
  MoleculeEvent,
  OrchestratorPack,
  PackContext,
} from '../types';

export type StatusRollup = 'running' | 'retry' | 'at-gate' | 'blocked';

export interface MoleculeAgg {
  formula: string;
  currentPhase: string;
  progress: number;
  statusRollup: StatusRollup;
  retryDisplay: string | null;
  kindBadge: string | null;
}

// Drill-in shape returned in FleetItem.packData. Renderers that want
// gascity-shaped data narrow against this type.
export interface GascityFleetData {
  agg: MoleculeAgg;
}

// Pseudo-step refs that should not count toward molecule progress. The
// step formula uses these for retry attempts and spec markers.
const STEP_SKIP_RE = /\.(attempt\.\d+|spec|workflow-finalize)$/;

function stepRef(b: Bead): string | null {
  const ref = b.metadata?.['gc.step_ref'];
  return typeof ref === 'string' ? ref : null;
}

function isCountableStep(b: Bead): boolean {
  const ref = stepRef(b);
  return ref !== null && !STEP_SKIP_RE.test(ref);
}

function phaseFromRef(ref: string): string {
  const dotIdx = ref.indexOf('.');
  return dotIdx >= 0 ? ref.slice(dotIdx + 1) : ref;
}

export function computeAgg(root: Bead, children: Bead[]): MoleculeAgg {
  const formula = root.title ?? root.id;

  const steps = children.filter(isCountableStep);
  const total = steps.length;
  const closed = steps.filter(b => b.status === 'closed').length;
  const progress = total > 0 ? closed / total : 0;

  const inProgressStep = steps.find(b => b.status === 'in_progress');
  const lastClosedStep = [...steps].reverse().find(b => b.status === 'closed');
  const phaseStep = inProgressStep ?? lastClosedStep;
  const phaseStepRef = phaseStep ? stepRef(phaseStep) : null;
  const currentPhase = phaseStepRef ? phaseFromRef(phaseStepRef) : '—';

  // blocked > at-gate > retry > running
  let statusRollup: StatusRollup = 'running';
  let retryDisplay: string | null = null;

  const hasBlocked = children.some(b => b.status === 'blocked');
  if (hasBlocked) {
    statusRollup = 'blocked';
  } else {
    const gateStep = children.find(b => b.type === 'gate' && b.status === 'in_progress');
    if (gateStep) {
      statusRollup = 'at-gate';
    } else {
      const retryStep = children.find(b => {
        if (b.status !== 'in_progress') return false;
        const attempt = b.metadata?.['gc.attempt'];
        return typeof attempt === 'number' && attempt >= 2;
      });
      if (retryStep) {
        statusRollup = 'retry';
        const attempt = retryStep.metadata!['gc.attempt'] as number;
        const max = retryStep.metadata?.['gc.max_attempts'];
        retryDisplay = max != null ? `retry ${attempt}/${max}` : `retry ${attempt}`;
      }
    }
  }

  const gcKind = root.metadata?.['gc.kind'];
  const kindBadge = gcKind === 'workflow' ? 'workflow' : null;

  return { formula, currentPhase, progress, statusRollup, retryDisplay, kindBadge };
}

function statusLabel(s: StatusRollup, retryDisplay: string | null): string {
  switch (s) {
    case 'blocked': return '⊘ blocked';
    case 'at-gate': return '⦿ at gate';
    case 'retry':   return `↻ ${retryDisplay ?? 'retry'}`;
    default:        return '◐ running';
  }
}

function statusTone(s: StatusRollup): BadgeTone {
  switch (s) {
    case 'blocked': return 'error';
    case 'at-gate': return 'warn';
    case 'retry':   return 'warn';
    default:        return 'info';
  }
}

function toFleetItem(root: Bead, agg: MoleculeAgg): FleetItem {
  const badges: Badge[] = [];
  if (agg.kindBadge) badges.push({ label: agg.kindBadge, tone: 'neutral' });
  return {
    id: root.id,
    title: root.title,
    primaryLabel: statusLabel(agg.statusRollup, agg.retryDisplay),
    primaryTone: statusTone(agg.statusRollup),
    progress: agg.progress,
    badges,
    createdAt: root.created_at ?? '',
    updatedAt: root.updated_at ?? '',
    packData: { agg } satisfies GascityFleetData,
  };
}

const badgeRules: BadgeRule[] = [
  {
    conceptKey: 'continuation-group',
    apply(md) {
      const v = md['gc.continuation_group'];
      if (typeof v !== 'string') return null;
      return { label: `⎇ ${v}`, tone: 'info' };
    },
  },
  {
    conceptKey: 'session-affinity',
    apply(md) {
      if (md['gc.session_affinity'] !== 'require') return null;
      return { label: '📌 session', tone: 'info' };
    },
  },
];

const metadataDisplay: KeyDisplayMap = {
  'gc.kind':                { label: 'kind' },
  'gc.routed_to':           { label: 'routed to' },
  'gc.attempt':             { label: 'attempt' },
  'gc.max_attempts':        { label: 'max attempts' },
  'gc.molecule_id':         { label: 'molecule id' },
  'gc.continuation_group':  { label: 'continuation group' },
  'gc.session_affinity':    { label: 'session affinity' },
  'gc.step_ref':            { label: 'step ref' },
  'gc.role_session':        { label: 'role session' },
  'gc.completed_session':   { label: 'completed session' },
  'gc.from':                { label: 'from' },
  'gc.to':                  { label: 'to' },
  'gc.priority':            { label: 'gc priority' },
  'gc.is_phase_2':          { label: 'phase 2' },
  'gc.parent_session':      { label: 'parent session' },
  'gc.target_session':      { label: 'target session' },
  'gc.template':            { label: 'template' },
  'gc.gate':                { label: 'gate' },
  'gc.formula':             { label: 'formula' },
};

// ─── Timeline events ────────────────────────────────────────────────────────

function beadLabel(bead: Bead, isRoot: boolean): string {
  if (isRoot) return bead.title;
  const ref = stepRef(bead);
  if (ref) return phaseFromRef(ref);
  const t = bead.title ?? bead.id;
  return t.length > 50 ? `${t.slice(0, 50)}…` : t;
}

function lifecycleEvents(bead: Bead, isRoot: boolean): MoleculeEvent[] {
  const events: MoleculeEvent[] = [];
  const role = isRoot ? 'molecule' : 'step';
  const lbl = beadLabel(bead, isRoot);

  events.push({
    timestamp: bead.created_at,
    type: 'bead.created',
    source: 'bd',
    beadId: bead.id,
    payload: { id: bead.id, title: bead.title, type: bead.type },
    display: { label: `${role} created · ${lbl}`, icon: '○' },
  });

  if (bead.started_at) {
    events.push({
      timestamp: bead.started_at,
      type: 'bead.started',
      source: 'bd',
      beadId: bead.id,
      payload: { id: bead.id, title: bead.title, type: bead.type },
      display: { label: `${role} started · ${lbl}`, icon: '◐', tone: 'info' },
    });
  }

  if (bead.status === 'closed') {
    const ts = bead.closed_at ?? bead.updated_at;
    events.push({
      timestamp: ts,
      type: 'bead.closed',
      source: 'bd',
      beadId: bead.id,
      payload: { id: bead.id, title: bead.title, type: bead.type },
      display: { label: `${role} closed · ${lbl}`, icon: '✓' },
    });
  }

  return events;
}

function commentEvents(bead: Bead): MoleculeEvent[] {
  if (!bead.comments?.length) return [];
  return bead.comments.map(c => {
    const excerpt = c.text.length > 60 ? `${c.text.slice(0, 60)}…` : c.text;
    return {
      timestamp: c.created_at,
      type: 'comment.added',
      source: 'bd',
      beadId: bead.id,
      payload: { id: c.id, author: c.author, text: c.text },
      display: { label: `${c.author}: ${excerpt}` },
    };
  });
}

async function getMoleculeEvents(
  rootId: string,
  { driver, workspace, signal }: PackContext,
): Promise<MoleculeEvent[]> {
  const root = await driver.fetch<Bead>(['show', rootId, '--json'], { workspace, signal });
  const childIds = (root.dependencies ?? []).map(d => d.id);
  const children = await Promise.all(
    childIds.map(cid => driver.fetch<Bead>(['show', cid, '--json'], { workspace, signal })),
  );

  const events: MoleculeEvent[] = [
    ...lifecycleEvents(root, true),
    ...commentEvents(root),
    ...children.flatMap(c => [...lifecycleEvents(c, false), ...commentEvents(c)]),
  ];
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return events;
}

// ─── Fleet ──────────────────────────────────────────────────────────────────

async function listFleetItems({ driver, workspace, signal, prev }: PackContext): Promise<FleetItem[]> {
  const roots = await driver.fetch<Bead[]>(
    ['list', '--type=molecule', '--status=in_progress', '--json'],
    { workspace, signal },
  );

  const prevById = new Map((prev ?? []).map(p => [p.id, p]));

  return Promise.all(roots.map(async (root): Promise<FleetItem> => {
    const cached = prevById.get(root.id);
    if (cached && cached.updatedAt === (root.updated_at ?? '')) return cached;

    try {
      const full = await driver.fetch<Bead>(['show', root.id, '--json'], { signal });
      const childIds = (full.dependencies ?? []).map(d => d.id);
      const children = await Promise.all(
        childIds.map(cid => driver.fetch<Bead>(['show', cid, '--json'], { signal })),
      );
      return toFleetItem(full, computeAgg(full, children));
    } catch {
      // Partial failure: render with minimal agg rather than dropping the row.
      return toFleetItem(root, computeAgg(root, []));
    }
  }));
}

async function listInstancesByFormula(
  { driver, workspace, signal }: PackContext,
  formulaName: string,
): Promise<FormulaInstanceItem[]> {
  const rows = await driver.fetch<Array<{
    id: string;
    title: string;
    status: string;
    created_at?: string;
    updated_at?: string;
  }>>(
    ['list', '--type=molecule', '--metadata-field', `gc.formula=${formulaName}`],
    { workspace, signal },
  );
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export const gascityPack: OrchestratorPack = {
  name: 'gascity',
  // v1: no client-side filesystem probe; bd-server's Workspace.pack
  // proto extension is the future home (see fo-0qdg9 design notes Q2).
  // For now gascity is the only registered pack and detect() always true.
  detect: () => true,
  capabilities: {
    moleculeGraph: true,
    formulaInstances: true,
  },
  listFleetItems,
  listInstancesByFormula,
  getMoleculeEvents,
  badgeRules,
  metadataDisplay,
};
