// Observe · Queue — bead-centric ready/all view replacing the fo-zz4pz §2 stub.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useQueuePoll } from '../../hooks/useQueuePoll';
import { useOpenPeek } from '../../hooks/usePeek';
import { ObserveNav } from '../../components/observe/ObserveNav';
import { QueueToolbar } from '../../components/observe/QueueToolbar';
import { QueueRow } from '../../components/observe/QueueRow';
import { QueueGroupHeader } from '../../components/observe/QueueGroupHeader';
import { CliMirror } from '../../components/observe/CliMirror';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import { claimBead, type QueueLens } from '../../client/queue';
import {
  type GroupBy,
  type QueueFilters,
  EMPTY_FILTERS,
  applyFilters,
  buildCliMirror,
  groupBeads,
  hasActiveFilter,
  isClaimable,
} from '../../lib/queue-filter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'queue'],
};

const DEFAULT_LENS: QueueLens = 'ready';
const DEFAULT_GROUP_BY: GroupBy = 'priority';

const VALID_LENSES: QueueLens[] = ['ready', 'ready-deferred', 'all', 'closed'];
const VALID_GROUPS: GroupBy[] = ['priority', 'status', 'formula', 'type', 'none'];

function parseLens(value: string | null): QueueLens {
  return (VALID_LENSES as string[]).includes(value ?? '')
    ? (value as QueueLens)
    : DEFAULT_LENS;
}

function parseGroupBy(value: string | null): GroupBy {
  return (VALID_GROUPS as string[]).includes(value ?? '')
    ? (value as GroupBy)
    : DEFAULT_GROUP_BY;
}

function parseCsv(value: string | null): string[] {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function parseCsvNumbers(value: string | null): number[] {
  return parseCsv(value)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));
}

function paramsToFilters(params: URLSearchParams): QueueFilters {
  return {
    q: params.get('q') ?? '',
    overdue: params.get('overdue') === '1',
    unclaimed: params.get('unclaimed') === '1',
    types: parseCsv(params.get('type')),
    priorities: parseCsvNumbers(params.get('priority')),
    statuses: parseCsv(params.get('status')),
    label: params.get('label') ?? '',
  };
}

function writeFilters(next: URLSearchParams, filters: QueueFilters) {
  function setOrDelete(key: string, value: string) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  setOrDelete('q', filters.q);
  setOrDelete('overdue', filters.overdue ? '1' : '');
  setOrDelete('unclaimed', filters.unclaimed ? '1' : '');
  setOrDelete('type', filters.types.join(','));
  setOrDelete('priority', filters.priorities.join(','));
  setOrDelete('status', filters.statuses.join(','));
  setOrDelete('label', filters.label);
}

export default function ObserveQueue() {
  const { current, isStub } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const { open: openPeek } = useOpenPeek();

  const lens = parseLens(searchParams.get('lens'));
  const groupBy = parseGroupBy(searchParams.get('groupBy'));
  const filters = useMemo(() => paramsToFilters(searchParams), [searchParams]);

  const { beads, loading, error, lastTickAt, pauseReason, retryIn, refresh } =
    useQueuePoll(current?.name ?? null, lens);

  const filtered = useMemo(() => applyFilters(beads, filters), [beads, filters]);
  const groups = useMemo(() => groupBeads(filtered, groupBy), [filtered, groupBy]);
  const cliCommand = useMemo(() => buildCliMirror(lens, filters), [lens, filters]);

  const setLens = useCallback((next: QueueLens) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (next === DEFAULT_LENS) np.delete('lens');
      else np.set('lens', next);
      return np;
    }, { replace: true });
  }, [setSearchParams]);

  const setGroupBy = useCallback((next: GroupBy) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (next === DEFAULT_GROUP_BY) np.delete('groupBy');
      else np.set('groupBy', next);
      return np;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilters = useCallback((next: QueueFilters) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      writeFilters(np, next);
      return np;
    }, { replace: true });
  }, [setSearchParams]);

  const onClaim = useCallback(async (id: string) => {
    if (!current) return;
    if (isStub) {
      // Stub mode: refresh skips network; emulate so the row disappears.
      await Promise.resolve();
      refresh();
      return;
    }
    await claimBead(id, current.name);
    refresh();
  }, [current, isStub, refresh]);

  const footLeft = loading
    ? 'loading queue…'
    : `${filtered.length}${hasActiveFilter(filters) ? ` of ${beads.length}` : ''} bead${filtered.length === 1 ? '' : 's'} · ${lens}`;
  const footRight = (() => {
    if (pauseReason === 'tab-hidden') return 'Observe · Queue · paused (tab hidden)';
    if (pauseReason === 'error-backoff') return `Observe · Queue · paused · retry in ${retryIn}s`;
    return 'Observe · Queue · tick 5s';
  })();
  useSetFooter(footLeft, footRight);

  if (!current) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ObserveNav active="queue" />
        <div className="placeholder-dest">
          <span className="dest-name">Observe · Queue</span>
          <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Select a workspace to see ready work.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ObserveNav active="queue" />

      <QueueToolbar
        lens={lens}
        onLensChange={setLens}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filters={filters}
        onFiltersChange={setFilters}
        totalCount={beads.length}
        filteredCount={filtered.length}
      />

      {error && beads.length === 0 && (
        <div style={{ padding: 20 }}>
          <LoadingFailedBanner kind="queue" />
        </div>
      )}

      {error && beads.length > 0 && (
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

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {!loading && beads.length === 0 && !error && (
          <EmptyState lens={lens} onClearFilters={() => setFilters(EMPTY_FILTERS)} hasFilters={false} />
        )}
        {!loading && beads.length > 0 && filtered.length === 0 && (
          <EmptyState lens={lens} onClearFilters={() => setFilters(EMPTY_FILTERS)} hasFilters={true} />
        )}

        {lastTickAt !== null && [...groups.entries()].map(([key, rows]) => (
          <div key={key}>
            <QueueGroupHeader label={key} count={rows.length} />
            {rows.map(b => (
              <QueueRow
                key={b.id}
                bead={b}
                workspace={current.name}
                claimable={isClaimable(b, lens)}
                onClaim={onClaim}
                onSelect={openPeek}
              />
            ))}
          </div>
        ))}
      </div>

      <CliMirror command={cliCommand} />
    </div>
  );
}

function EmptyState({
  lens, onClearFilters, hasFilters,
}: {
  lens: QueueLens;
  onClearFilters: () => void;
  hasFilters: boolean;
}) {
  if (hasFilters) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 12,
      }}>
        <span style={{ fontSize: 14 }}>No beads match these filters.</span>
        <button
          type="button"
          onClick={onClearFilters}
          style={{
            fontSize: 11, padding: '4px 12px', border: '1px solid var(--rule)', borderRadius: 2,
            background: 'var(--bg)', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}
        >
          clear filters
        </button>
      </div>
    );
  }
  const lensMessage =
    lens === 'all'
      ? 'No open work in this workspace yet.'
      : 'Nothing is ready right now.';
  const hint =
    lens === 'all'
      ? <>Use <code style={{ background: 'var(--bg-2)', padding: '1px 5px' }}>Capture</code> to add a bead.</>
      : <>Switch to the <strong>all</strong> lens to see in-progress or blocked beads, or open <code style={{ background: 'var(--bg-2)', padding: '1px 5px' }}>Capture</code>.</>;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 12,
    }}>
      <span style={{ fontSize: 14 }}>{lensMessage}</span>
      <span>{hint}</span>
    </div>
  );
}
