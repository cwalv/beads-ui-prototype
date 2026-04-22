import { bdClient } from './bd';
import type { Bead } from '../types';

export async function getBead(id: string): Promise<Bead> {
  return bdClient.fetch<Bead>(['show', id, '--json']);
}

export async function updateBead(id: string, patch: {
  title?: string; description?: string; design?: string;
  notes?: string; acceptance?: string; status?: string;
  priority?: number; assignee?: string; unassign?: boolean;
  addLabel?: string; removeLabel?: string; externalRef?: string;
}): Promise<void> {
  const args = ['update', id];
  if (patch.title !== undefined) { args.push('--title'); args.push(patch.title); }
  if (patch.description !== undefined) { args.push('--description'); args.push(patch.description); }
  if (patch.design !== undefined) { args.push('--design'); args.push(patch.design); }
  if (patch.notes !== undefined) { args.push('--notes'); args.push(patch.notes); }
  if (patch.acceptance !== undefined) { args.push('--acceptance'); args.push(patch.acceptance); }
  if (patch.status !== undefined) args.push(`--status=${patch.status}`);
  if (patch.priority !== undefined) args.push(`--priority=${patch.priority}`);
  if (patch.assignee !== undefined) args.push(`--assignee=${patch.assignee}`);
  if (patch.unassign) args.push('--unassignee');
  if (patch.addLabel !== undefined) { args.push('--add-label'); args.push(patch.addLabel); }
  if (patch.removeLabel !== undefined) { args.push('--remove-label'); args.push(patch.removeLabel); }
  if (patch.externalRef !== undefined) args.push(`--external-ref=${patch.externalRef}`);
  await bdClient.fetch<unknown>(args);
}

export async function addComment(id: string, body: string): Promise<void> {
  await bdClient.fetch<unknown>(['comment', id, body]);
}

export async function addDep(from: string, to: string, type: string): Promise<void> {
  await bdClient.fetch<unknown>(['dep', 'add', from, to, `--type=${type}`]);
}

export async function removeDep(from: string, to: string): Promise<void> {
  await bdClient.fetch<unknown>(['dep', 'remove', from, to]);
}
