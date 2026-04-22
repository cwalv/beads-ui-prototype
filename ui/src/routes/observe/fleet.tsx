import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useFleetPoll } from '../../hooks/useFleetPoll';
import { FleetSummary, type GroupBy } from '../../components/observe/FleetSummary';
import { FleetGroupHeader } from '../../components/observe/FleetGroupHeader';
import { FleetRow } from '../../components/observe/FleetRow';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import type { Destination } from '../../types';
import type { FleetMolecule } from '../../client/fleet';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'fleet'],
};

const LS_GROUP_BY_KEY = 'beads-ui.fleet.groupBy';

function resolveGroupBy(param: string | null): GroupBy {
  if (param === 'formula' || param === 'workspace' || param === 'status') return param;
  const saved = localStorage.getItem(LS_GROUP_BY_KEY);
  if (saved === 'formula' || saved === 'workspace' || saved === 'status') return saved;
  return 'formula';
}

function groupMolecules(molecules: FleetMolecule[], groupBy: GroupBy): Map<string, FleetMolecule[]> {
  const map = new Map<string, FleetMolecule[]>();
  for (const m of molecules) {
    const key =
      groupBy === 'formula' ? m.agg.formula :
      groupBy === 'workspace' ? m.workspace :
      m.agg.statusRollup;
    const arr = map.get(key) ?? [];
    arr.push(m);
    map.set(key, arr);
  }
  return map;
}

export default function ObserveFleet() {
  const { current, workspaces, isConsolidated } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const groupBy = resolveGroupBy(searchParams.get('groupBy'));

  const wsNames = useMemo(() => {
    if (isConsolidated) return workspaces.map(w => w.name);
    return current ? [current.name] : [];
  }, [current, workspaces, isConsolidated]);

  const { molecules, loading, error, lastTickAt, pauseReason, retryIn, unreachableWorkspaces } =
    useFleetPoll(wsNames);

  const groups = useMemo(
    () => groupMolecules(molecules, groupBy),
    [molecules, groupBy],
  );

  function setGroupBy(g: GroupBy) {
    localStorage.setItem(LS_GROUP_BY_KEY, g);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('groupBy', g);
      return next;
    }, { replace: true });
  }

  const footLeft = loading
    ? 'loading fleet…'
    : `${molecules.length} molecule${molecules.length !== 1 ? 's' : ''} · ${wsNames.length} workspace${wsNames.length !== 1 ? 's' : ''}`;
  const footRight = (() => {
    if (pauseReason === 'tab-hidden') return 'Observe · Fleet · paused (tab hidden)';
    if (pauseReason === 'error-backoff') return `Observe · Fleet · paused · retry in ${retryIn}s`;
    return 'Observe · Fleet · tick 3s';
  })();

  useSetFooter(footLeft, footRight);

  if (!current && !isConsolidated) {
    return (
      <div className="placeholder-dest">
        <span className="dest-name">Observe · Fleet</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Select a workspace to see live molecules.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <FleetSummary
        molecules={molecules}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
      />

      {/* Unreachable workspace warning */}
      {unreachableWorkspaces.length > 0 && (
        <div style={{
          padding: '4px 20px',
          background: 'var(--warn-soft)',
          borderBottom: '1px solid var(--warn)',
          fontSize: 11,
          color: 'var(--warn)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}
          title={`Unreachable: ${unreachableWorkspaces.join(', ')}`}
        >
          {unreachableWorkspaces.length} workspace{unreachableWorkspaces.length !== 1 ? 's' : ''} unreachable
        </div>
      )}

      {/* Initial load failure */}
      {error && molecules.length === 0 && (
        <div style={{ padding: '20px' }}>
          <LoadingFailedBanner kind="fleet" />
        </div>
      )}

      {/* Error banner during poll (keep existing rows visible) */}
      {error && molecules.length > 0 && (
        <div style={{
          padding: '4px 20px',
          background: 'var(--warn-soft)',
          borderBottom: '1px solid var(--warn)',
          fontSize: 11,
          color: 'var(--warn)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}>
          paused · retry in {retryIn}s (stale data shown)
        </div>
      )}

      {/* Fleet body */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {!loading && molecules.length === 0 && !error && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 10,
            color: 'var(--mute)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}>
            <span style={{ fontSize: 14 }}>No live molecules in this workspace.</span>
            <span>Pour one with <code style={{ background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 2 }}>gc mol pour &lt;formula&gt;</code> or sling work to an agent to see it here.</span>
          </div>
        )}

        {lastTickAt !== null && [...groups.entries()].map(([groupKey, rows]) => (
          <div key={groupKey}>
            <FleetGroupHeader formula={groupKey} count={rows.length} />
            {rows
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map(m => (
                <FleetRow
                  key={m.id}
                  molecule={m}
                  onSelect={id => navigate(`/observe/graph/${id}`)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
