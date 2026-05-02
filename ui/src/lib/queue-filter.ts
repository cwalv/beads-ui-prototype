import type { Bead } from '../types';
import type { QueueLens } from '../client/queue';

export type GroupBy = 'priority' | 'status' | 'formula' | 'type' | 'none';

export interface QueueFilters {
  q: string;
  overdue: boolean;
  unclaimed: boolean;
  types: string[];
  priorities: number[];
  statuses: string[];
  label: string;
}

export const EMPTY_FILTERS: QueueFilters = {
  q: '',
  overdue: false,
  unclaimed: false,
  types: [],
  priorities: [],
  statuses: [],
  label: '',
};

export function hasActiveFilter(f: QueueFilters): boolean {
  return (
    f.q.length > 0 ||
    f.overdue ||
    f.unclaimed ||
    f.types.length > 0 ||
    f.priorities.length > 0 ||
    f.statuses.length > 0 ||
    f.label.length > 0
  );
}

function toIso(t: unknown): string | undefined {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && 'seconds' in (t as object)) {
    const secs = Number((t as { seconds: number | string }).seconds);
    if (Number.isFinite(secs)) return new Date(secs * 1000).toISOString();
  }
  return undefined;
}

export function applyFilters(beads: Bead[], filters: QueueFilters, now = Date.now()): Bead[] {
  const q = filters.q.trim().toLowerCase();
  const labelQ = filters.label.trim().toLowerCase();
  return beads.filter(b => {
    if (q) {
      const hay = `${b.id} ${b.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.unclaimed && b.assignee && b.assignee.length > 0) return false;
    if (filters.overdue) {
      const due = toIso(b.due_at);
      if (!due) return false;
      if (new Date(due).getTime() >= now) return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(b.type)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(b.priority)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(b.status)) return false;
    if (labelQ) {
      const labels = (b.labels ?? []).map(l => l.toLowerCase());
      if (!labels.some(l => l.includes(labelQ))) return false;
    }
    return true;
  });
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'P0 — critical',
  1: 'P1 — high',
  2: 'P2 — medium',
  3: 'P3 — low',
  4: 'P4 — backlog',
};

export function priorityLabel(p: number): string {
  return PRIORITY_LABELS[p] ?? `P${p}`;
}

export function groupBeads(beads: Bead[], by: GroupBy): Map<string, Bead[]> {
  const map = new Map<string, Bead[]>();
  if (by === 'none') {
    if (beads.length > 0) map.set('All beads', beads);
    return map;
  }
  for (const b of beads) {
    const key =
      by === 'priority' ? priorityLabel(b.priority) :
      by === 'status'   ? (b.status || 'open') :
      by === 'formula'  ? (b.source_formula?.trim() ? b.source_formula : 'no formula') :
      /* type */        (b.type || 'task');
    const arr = map.get(key) ?? [];
    arr.push(b);
    map.set(key, arr);
  }
  // Stable ordering for known group-by axes
  if (by === 'priority') return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  if (by === 'status') {
    const order = ['open', 'in_progress', 'blocked', 'deferred', 'pinned', 'hooked', 'closed'];
    return new Map([...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }));
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function buildCliMirror(lens: QueueLens, filters: QueueFilters): string {
  const parts: string[] = [];
  if (lens === 'all') {
    parts.push('bd list', '--status=open,in_progress');
  } else {
    parts.push('bd ready');
    if (lens === 'ready-deferred') parts.push('--include-deferred');
  }
  if (filters.unclaimed) parts.push('--unassigned');
  if (filters.types.length === 1) parts.push(`--type=${filters.types[0]}`);
  // bd ready / list accept a single --type; multi-type flagged in UI but mirror omits with note
  if (filters.priorities.length === 1) parts.push(`--priority=${filters.priorities[0]}`);
  if (filters.label) parts.push(`--label=${filters.label}`);
  if (filters.statuses.length > 0 && lens === 'all') {
    parts.push(`--status=${filters.statuses.join(',')}`);
    // dedupe: filter out the default --status above
    const idx = parts.indexOf('--status=open,in_progress');
    if (idx >= 0) parts.splice(idx, 1);
  }
  if (filters.overdue) parts.push('--due-before=now');
  if (filters.q) parts.push(`# search: "${filters.q}"`);
  return parts.join(' ');
}

export function isClaimable(b: Bead, lens: QueueLens): boolean {
  if (lens === 'all') return false;
  return b.status === 'open' && (!b.assignee || b.assignee.length === 0);
}
