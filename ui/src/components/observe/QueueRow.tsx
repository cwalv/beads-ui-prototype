import { useState } from 'react';
import { formatAge } from '../../lib/age';
import { workspaceColor } from '../../lib/workspace-color';
import type { Bead } from '../../types';

interface Props {
  bead: Bead;
  workspace: string;
  showWorkspace?: boolean;
  claimable: boolean;
  onClaim: (id: string) => Promise<void>;
  onSelect: (id: string) => void;
}

function priorityTone(p: number): string {
  switch (p) {
    case 0: return 'var(--danger)';
    case 1: return 'var(--warn)';
    case 2: return 'var(--accent)';
    case 3: return 'var(--ink-3)';
    default: return 'var(--mute)';
  }
}

function statusGlyph(s: string): string {
  switch (s) {
    case 'open':        return '○';
    case 'in_progress': return '◐';
    case 'blocked':     return '●';
    case 'deferred':    return '❄';
    case 'pinned':      return '◆';
    case 'hooked':      return '◇';
    case 'closed':      return '✓';
    default:            return '·';
  }
}

function statusTone(s: string): string {
  switch (s) {
    case 'blocked': return 'var(--danger)';
    case 'deferred': return 'var(--mute)';
    case 'in_progress': return 'var(--accent)';
    case 'closed': return 'var(--ok)';
    default: return 'var(--ink-3)';
  }
}

function metaString(m: unknown, key: string): string | null {
  if (!m || typeof m !== 'object') return null;
  const v = (m as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

function readinessHint(bead: Bead): string | null {
  const dc = bead.dependency_count ?? 0;
  if (bead.status === 'blocked' && dc > 0) {
    return `blocked · ${dc} dep${dc === 1 ? '' : 's'}`;
  }
  if (bead.status === 'in_progress') return 'in progress';
  if (dc > 0) return `${dc} dep${dc === 1 ? '' : 's'} (resolved)`;
  return 'no blockers';
}

function formatDueDate(s?: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const overdue = d.getTime() < Date.now();
  const iso = s.replace('T', ' ').replace(/\..*$/, '').replace(/Z$/, '');
  return overdue ? `overdue · ${iso}` : `due ${iso}`;
}

export function QueueRow({ bead, workspace, showWorkspace, claimable, onClaim, onSelect }: Props) {
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const wsColor = workspaceColor(workspace);
  const routedTo = metaString(bead.metadata, 'gc.routed_to');
  const routedToShort = routedTo ? routedTo.split('/').pop() ?? routedTo : null;
  const due = formatDueDate(typeof bead.due_at === 'string' ? bead.due_at : undefined);
  const isOverdue = due?.startsWith('overdue');

  async function doClaim(e: React.MouseEvent) {
    e.stopPropagation();
    if (claiming) return;
    setClaiming(true);
    setClaimError(null);
    try {
      await onClaim(bead.id);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      role="row"
      onClick={() => onSelect(bead.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 18px 110px 60px 1fr auto auto auto auto',
        alignItems: 'center',
        borderBottom: '1px solid var(--rule-2)',
        fontSize: 11.5,
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <div style={{ background: wsColor, alignSelf: 'stretch' }} />

      {/* Status glyph */}
      <div style={{ textAlign: 'center', color: statusTone(bead.status), fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        {statusGlyph(bead.status)}
      </div>

      {/* Bead id */}
      <div style={{ padding: '8px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bead.id}
      </div>

      {/* Priority + type */}
      <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--on-strong)',
          background: priorityTone(bead.priority),
          padding: '1px 5px',
          borderRadius: 2,
          fontWeight: 600,
        }}>
          P{bead.priority}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--mute)' }}>
          {bead.type}
        </span>
      </div>

      {/* Title + secondary line */}
      <div style={{ padding: '8px 12px', overflow: 'hidden' }}>
        <div style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bead.title}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--mute)',
          marginTop: 2,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <span>{readinessHint(bead)}</span>
          {bead.assignee && <span title="assignee">@{bead.assignee}</span>}
          {showWorkspace && <span style={{ color: 'var(--ink-3)' }}>{workspace}</span>}
          {bead.source_formula && <span title="source formula">via {bead.source_formula}</span>}
          {due && <span style={{ color: isOverdue ? 'var(--danger)' : 'var(--mute)' }}>{due}</span>}
        </div>
      </div>

      {/* Routed-to chip */}
      <div style={{ padding: '0 8px' }}>
        {routedToShort ? (
          <span
            title={`gc.routed_to=${routedTo}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--ink-3)',
              border: '1px solid var(--rule)',
              padding: '1px 5px',
              borderRadius: 2,
              whiteSpace: 'nowrap',
            }}
          >
            → {routedToShort}
          </span>
        ) : null}
      </div>

      {/* Labels */}
      <div style={{ padding: '0 8px', display: 'flex', gap: 4, maxWidth: 180, overflow: 'hidden' }}>
        {(bead.labels ?? []).slice(0, 2).map(l => (
          <span key={l} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--mute)',
            border: '1px solid var(--rule-2)',
            padding: '1px 4px',
            borderRadius: 2,
            whiteSpace: 'nowrap',
          }}>{l}</span>
        ))}
        {(bead.labels?.length ?? 0) > 2 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--mute)' }}>
            +{(bead.labels!.length - 2)}
          </span>
        )}
      </div>

      {/* Age */}
      <div style={{ padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', textAlign: 'right' }}>
        {formatAge(typeof bead.created_at === 'string' ? bead.created_at : new Date().toISOString())}
      </div>

      {/* Claim button */}
      <div style={{ padding: '0 12px 0 4px' }}>
        {claimable ? (
          <button
            type="button"
            onClick={doClaim}
            disabled={claiming}
            title={claimError ?? 'bd update <id> --claim'}
            style={{
              fontSize: 10.5,
              padding: '3px 10px',
              border: '1px solid var(--accent)',
              borderRadius: 2,
              background: claiming ? 'var(--bg-3)' : 'var(--accent-soft)',
              color: 'var(--accent)',
              cursor: claiming ? 'wait' : 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {claiming ? 'claiming…' : 'claim'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
