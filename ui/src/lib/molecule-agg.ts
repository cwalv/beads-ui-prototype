import type { Bead } from '../types';

export type StatusRollup = 'running' | 'retry' | 'at-gate' | 'blocked';

export interface MoleculeAgg {
  formula: string;
  currentPhase: string;
  progress: number;
  statusRollup: StatusRollup;
  retryDisplay: string | null;
  kindBadge: string | null;
}

// Exclude pseudo-step beads from progress counting
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

  // Current phase: first in_progress step, then last closed step, else '—'
  const inProgressStep = steps.find(b => b.status === 'in_progress');
  const lastClosedStep = [...steps].reverse().find(b => b.status === 'closed');
  const phaseStep = inProgressStep ?? lastClosedStep;
  const phaseStepRef = phaseStep ? stepRef(phaseStep) : null;
  const currentPhase = phaseStepRef ? phaseFromRef(phaseStepRef) : '—';

  // Status rollup: blocked > at-gate > retry > running
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
