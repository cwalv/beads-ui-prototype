// fo-l0t9k: per-molecule events history — replaces 'coming soon' stub
import { useParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useMoleculeTimeline } from '../../hooks/useMoleculeTimeline';
import { useOpenPeek } from '../../hooks/usePeek';
import { ObserveNav } from '../../components/observe/ObserveNav';
import { TimelineEventList } from '../../components/observe/TimelineEventList';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'timeline'],
};

export default function ObserveTimeline() {
  const { moleculeId = '' } = useParams<{ moleculeId: string }>();
  const { current } = useWorkspace();
  const { events, loading, error, refresh } = useMoleculeTimeline(
    moleculeId,
    current?.name ?? null,
  );
  const { open } = useOpenPeek();

  useSetFooter(
    loading
      ? 'loading…'
      : error
        ? 'error'
        : `${events.length} event${events.length === 1 ? '' : 's'}`,
    'Observe · Timeline',
  );

  if (!moleculeId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ObserveNav active="timeline" />
        <div className="placeholder-dest">
          <span className="dest-name">Observe · Timeline</span>
          <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>No molecule selected.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ObserveNav active="timeline" moleculeId={moleculeId} />

      {loading && (
        <div style={{
          padding: '10px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--mute)',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}>
          loading events…
        </div>
      )}

      {error && !loading && (
        <LoadingFailedBanner kind="molecule-graph" onRetry={refresh} moleculeId={moleculeId} />
      )}

      {!loading && !error && (
        <TimelineEventList events={events} onBeadClick={open} />
      )}
    </div>
  );
}
