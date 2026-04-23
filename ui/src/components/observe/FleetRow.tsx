import { formatAge } from '../../lib/age';
import { workspaceColor } from '../../lib/workspace-color';
import type { FleetMolecule } from '../../client/fleet';
import type { StatusRollup } from '../../lib/molecule-agg';

interface Props {
  molecule: FleetMolecule;
  onSelect: (id: string) => void;
}

function statusColor(s: StatusRollup): string {
  switch (s) {
    case 'blocked': return 'var(--danger)';
    case 'at-gate': return 'var(--warn)';
    case 'retry':   return 'var(--warn)';
    default:        return 'var(--accent)';
  }
}

function statusLabel(molecule: FleetMolecule): string {
  const { statusRollup, retryDisplay } = molecule.agg;
  switch (statusRollup) {
    case 'blocked': return '⊘ blocked';
    case 'at-gate': return '⦿ at gate';
    case 'retry':   return `↻ ${retryDisplay ?? 'retry'}`;
    default:        return '◐ running';
  }
}

export function FleetRow({ molecule, onSelect }: Props) {
  const { agg } = molecule;
  const wsColor = workspaceColor(molecule.workspace);
  const progColor = statusColor(agg.statusRollup);

  return (
    <div
      role="row"
      onClick={() => onSelect(molecule.id)}
      style={{
        display: 'grid',
        // fo-zz4pz §6: wisp-badge-slot column reserved for future wisp badge (see fo-zz4pz §6)
        gridTemplateColumns: '4px 120px 110px 1fr 200px 90px 60px 28px',
        alignItems: 'center',
        borderBottom: '1px solid var(--rule-2)',
        fontSize: 11.5,
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* Workspace color bar */}
      <div style={{ background: wsColor, alignSelf: 'stretch' }} />

      {/* Workspace name */}
      <div style={{
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--mute)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {molecule.workspace}
      </div>

      {/* Molecule id */}
      <div style={{
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ink-2)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {molecule.id}
      </div>

      {/* Title */}
      <div style={{
        padding: '10px 12px',
        color: 'var(--ink)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {molecule.title}
        {agg.kindBadge && (
          <span style={{
            marginLeft: 6,
            fontSize: 9.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--mute)',
            border: '1px solid var(--rule)',
            borderRadius: 2,
            padding: '1px 4px',
          }}>
            {agg.kindBadge}
          </span>
        )}
      </div>

      {/* Phase + progress bar */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          marginBottom: 3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          at · {agg.currentPhase}
        </div>
        <div style={{
          height: 4,
          background: 'var(--bg-3)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(1, agg.progress) * 100}%`,
            background: progColor,
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Status */}
      <div style={{
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: statusColor(agg.statusRollup),
      }}>
        {statusLabel(molecule)}
      </div>

      {/* Age */}
      <div style={{
        padding: '10px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--mute)',
        textAlign: 'right',
      }}>
        {formatAge(molecule.createdAt)}
      </div>

      {/* fo-zz4pz §6: wisp badge slot — empty until wisp UI is designed and bd-server exposes wisp/molecule distinction */}
      <span className="wisp-badge-slot" aria-hidden="true" />
    </div>
  );
}
