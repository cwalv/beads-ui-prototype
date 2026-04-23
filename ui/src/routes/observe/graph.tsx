import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useMoleculeGraph } from '../../hooks/useMoleculeGraph';
import { usePeek } from '../../hooks/usePeek';
import { GraphCanvas } from '../../components/observe/GraphCanvas';
import { GraphFilterRail } from '../../components/observe/GraphFilterRail';
import { PeekDrawer } from '../../components/chrome/PeekDrawer';
import { IssuePeekBody } from '../../components/peek/IssuePeekBody';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import { ObserveNav } from '../../components/observe/ObserveNav';
import type { Destination, BeadStatus } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'graph'],
};

export default function ObserveGraph() {
  const { moleculeId = '' } = useParams<{ moleculeId: string }>();
  const [depth, setDepth] = useState(3);
  const { graph, loading, error, refresh, patchNode } = useMoleculeGraph(moleculeId, depth);
  const { peekId, open, close } = usePeek();

  const [hiddenStatuses, setHiddenStatuses] = useState<Set<BeadStatus>>(new Set());
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const visibleNodes = graph?.nodes.filter(n =>
    !hiddenStatuses.has(n.bead.status) &&
    (!n.bead.type || !hiddenTypes.has(n.bead.type))
  ) ?? [];

  const peekNode = graph?.nodes.find(n => n.id === peekId);

  const stats = graph ? {
    total: graph.nodes.length,
    blocked: graph.nodes.filter(n => n.bead.status === 'blocked').length,
    inProgress: graph.nodes.filter(n => n.bead.status === 'in_progress').length,
    closed: graph.nodes.filter(n => n.bead.status === 'closed').length,
    ready: graph.nodes.filter(n => n.isReady).length,
  } : null;

  useSetFooter(
    stats
      ? `${stats.total} beads · ${stats.blocked} blocked · ${stats.inProgress} in progress · ${stats.ready} ready`
      : loading ? 'loading graph…' : '',
    'Observe · Graph'
  );

  if (error) {
    return (
      <div className="observe-graph" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ObserveNav active="graph" moleculeId={moleculeId} />
        <LoadingFailedBanner kind="molecule-graph" onRetry={refresh} moleculeId={moleculeId} />
      </div>
    );
  }

  if (!moleculeId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ObserveNav active="graph" />
        <div className="placeholder-dest">
          <span className="dest-name">Observe · Graph</span>
          <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>No molecule selected</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ObserveNav active="graph" moleculeId={moleculeId} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'var(--bg-2)' }}>
      <GraphFilterRail
        nodes={graph?.nodes ?? []}
        hiddenStatuses={hiddenStatuses}
        hiddenTypes={hiddenTypes}
        onToggleStatus={s => setHiddenStatuses(prev => {
          const next = new Set(prev);
          if (next.has(s)) next.delete(s); else next.add(s);
          return next;
        })}
        onToggleType={t => setHiddenTypes(prev => {
          const next = new Set(prev);
          if (next.has(t)) next.delete(t); else next.add(t);
          return next;
        })}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 3,
            padding: '4px 12px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--mute)',
          }}>
            computing layout…
          </div>
        )}
        {graph && (
          <>
            <GraphCanvas
              graph={{ ...graph, nodes: visibleNodes }}
              selectedId={peekId}
              onNodeClick={open}
            />
            <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
              <button
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  border: '1px solid var(--rule)',
                  borderRadius: 2,
                  background: 'var(--bg)',
                  color: 'var(--ink-3)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
                onClick={() => setDepth(d => d + 3)}
              >
                show more (depth {depth} → {depth + 3})
              </button>
            </div>
          </>
        )}
      </div>
      {peekId && (
        <PeekDrawer
          kind="bead"
          id={peekId}
          title={peekNode?.bead.title ?? peekId}
          status={peekNode?.bead.status ?? 'open'}
        >
          <IssuePeekBody beadId={peekId} onClose={close} onNodePatch={patchNode} />
        </PeekDrawer>
      )}
    </div>
    </div>
  );
}
