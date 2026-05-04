import { useState, useMemo } from 'react';
import type { MoleculeEvent } from '../../conventions/types';
import { formatAge } from '../../lib/age';

interface Props {
  events: MoleculeEvent[];
  onBeadClick?: (beadId: string) => void;
}

const TONE_COLOR: Record<string, string> = {
  info: 'var(--accent)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
};

function toneColor(tone?: string): string {
  return tone ? (TONE_COLOR[tone] ?? 'var(--mute)') : 'var(--mute)';
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function EventRow({
  event,
  prevTs,
  onBeadClick,
}: {
  event: MoleculeEvent;
  prevTs: string | null;
  onBeadClick?: (beadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = Object.keys(event.payload).length > 0;
  const showDateBanner = !prevTs || formatDate(event.timestamp) !== formatDate(prevTs);
  const color = toneColor(event.display.tone);

  return (
    <>
      {showDateBanner && (
        <div style={{
          padding: '6px 16px 4px',
          fontSize: 10.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--mute)',
          borderBottom: '1px solid var(--rule-2)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {formatDate(event.timestamp)}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          borderBottom: '1px solid var(--rule-2)',
          minHeight: 32,
          cursor: hasPayload ? 'pointer' : 'default',
        }}
        onClick={() => hasPayload && setExpanded(e => !e)}
      >
        {/* time axis */}
        <div style={{
          width: 90,
          flexShrink: 0,
          padding: '7px 10px 7px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--mute)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}>
          {formatTs(event.timestamp)}
        </div>

        {/* connector */}
        <div style={{
          width: 24,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 9,
        }}>
          <div style={{ fontSize: 12, color, lineHeight: 1 }}>
            {event.display.icon ?? '·'}
          </div>
          <div style={{ flex: 1, width: 1, background: 'var(--rule-2)', marginTop: 4 }} />
        </div>

        {/* content */}
        <div style={{ flex: 1, padding: '6px 16px 6px 8px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              color: 'var(--ink-2)',
              flex: 1,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {event.display.label}
            </span>
            <span style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--mute)',
              flexShrink: 0,
            }}>
              {formatAge(event.timestamp)}
            </span>
          </div>
          {event.beadId && onBeadClick && (
            <button
              type="button"
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                padding: '1px 0',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              onClick={e => { e.stopPropagation(); onBeadClick(event.beadId!); }}
            >
              {event.beadId}
            </button>
          )}
          {expanded && hasPayload && (
            <pre style={{
              margin: '6px 0 2px',
              padding: '6px 8px',
              background: 'var(--bg-2)',
              border: '1px solid var(--rule)',
              borderRadius: 2,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-3)',
              overflow: 'auto',
              maxHeight: 160,
            }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>

        {/* source tag */}
        <div style={{
          flexShrink: 0,
          padding: '8px 16px 6px 0',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--mute-2)',
        }}>
          {event.source}
        </div>
      </div>
    </>
  );
}

export function TimelineEventList({ events, onBeadClick }: Props) {
  const allTypes = useMemo(
    () => [...new Set(events.map(e => e.type))].sort(),
    [events],
  );
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => hiddenTypes.size === 0 ? events : events.filter(e => !hiddenTypes.has(e.type)),
    [events, hiddenTypes],
  );

  function toggleType(t: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  if (events.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 12,
      }}>
        <span style={{ fontSize: 14 }}>No events recorded.</span>
        <span style={{ color: 'var(--mute-2)', fontSize: 11 }}>
          Lifecycle events appear once beads are created or started.
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* filter bar */}
      {allTypes.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, padding: '6px 16px',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--bg-2)',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {allTypes.map(t => {
            const active = !hiddenTypes.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                style={{
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: 2,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                  background: active ? 'var(--accent-soft)' : 'var(--bg)',
                  color: active ? 'var(--accent)' : 'var(--mute)',
                  cursor: 'pointer',
                  transition: 'none',
                }}
              >
                {t}
              </button>
            );
          })}
          {hiddenTypes.size > 0 && (
            <button
              type="button"
              onClick={() => setHiddenTypes(new Set())}
              style={{
                fontSize: 10.5, fontFamily: 'var(--font-mono)',
                padding: '2px 8px', borderRadius: 2,
                border: '1px solid var(--rule)', background: 'transparent',
                color: 'var(--mute)', cursor: 'pointer',
              }}
            >
              clear filters
            </button>
          )}
        </div>
      )}

      {/* event list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 120, color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 12,
          }}>
            No events match the active filter.
          </div>
        ) : (
          visible.map((event, i) => (
            <EventRow
              key={`${event.timestamp}-${event.type}-${event.beadId ?? ''}-${i}`}
              event={event}
              prevTs={i > 0 ? visible[i - 1].timestamp : null}
              onBeadClick={onBeadClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
