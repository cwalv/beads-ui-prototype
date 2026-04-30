import { bdClient } from './bd';
import type { Bead } from '../types';

export type QueueLens = 'ready' | 'ready-deferred' | 'all';

export interface QueueResult {
  beads: Bead[];
}

const READY_LIMIT = 100;
const ALL_LIMIT = 200;

export async function listQueueBeads(
  workspace: string,
  lens: QueueLens,
  signal: AbortSignal,
): Promise<QueueResult> {
  const args = buildQueueArgs(lens);
  const beads = await bdClient.fetch<Bead[]>(args, { signal, workspace });
  return { beads };
}

export function buildQueueArgs(lens: QueueLens): string[] {
  switch (lens) {
    case 'ready':
      return ['ready', `--limit=${READY_LIMIT}`, '--json'];
    case 'ready-deferred':
      return ['ready', `--limit=${READY_LIMIT}`, '--include-deferred', '--json'];
    case 'all':
      return ['list', '--status=open,in_progress', `--limit=${ALL_LIMIT}`, '--json'];
  }
}

export async function claimBead(id: string, workspace: string): Promise<void> {
  await bdClient.fetch<unknown>(['update', id, '--claim'], { workspace });
}
