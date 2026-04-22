import { useState, useEffect } from 'react';
import { listInstances } from '../../client/formula';
import type { FormulaInstance } from '../../client/formula';
import { useNavigate } from 'react-router-dom';

interface Props {
  formulaName: string;
  workspace: string;
}

const STATUS_COLOR: Record<string, string> = {
  in_progress: 'var(--accent)',
  open: 'var(--ok)',
  blocked: 'var(--danger)',
  closed: 'var(--mute)',
};

export function InstancesView({ formulaName, workspace }: Props) {
  const [instances, setInstances] = useState<FormulaInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    listInstances(formulaName, workspace, ctrl.signal)
      .then(rows => {
        if (!ctrl.signal.aborted) setInstances(rows);
      })
      .catch(e => {
        if (ctrl.signal.aborted) return;
        const err = e as { message?: string };
        setError(err.message ?? 'Could not reach bd');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [formulaName, workspace]);

  if (loading) return <div className="ed-loading">Loading instances…</div>;

  return (
    <div className="ed-inst">
      {error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 12 }}>
          Instances data unavailable — couldn't reach bd. {error}
        </div>
      )}
      {!error && instances.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 12 }}>
          No molecules poured from this formula — or instances data not yet wired (see fo-beads-ui-observe).
        </div>
      )}
      {instances.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 10 }}>
            molecules poured from this formula ({instances.length} total)
          </div>
          {instances.map(r => (
            <div
              key={r.id}
              className="ed-inst-row"
              onClick={() => navigate(`/bead/${r.id}`)}
            >
              <span className="mol">{r.id}</span>
              <span className="issue">{r.id}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{r.title}</span>
              <span className="st" style={{ color: STATUS_COLOR[r.status] ?? 'var(--mute)' }}>
                ● {r.status}
              </span>
              <span className="at">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
