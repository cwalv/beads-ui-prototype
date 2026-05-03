import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bdClient } from '../../client/bd';
import { getActivePack, type FormulaInstanceItem } from '../../conventions';

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
  const [instances, setInstances] = useState<FormulaInstanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    const pack = getActivePack();
    if (!pack.capabilities.formulaInstances || !pack.listInstancesByFormula) {
      setUnsupported(true);
      setLoading(false);
      return () => ctrl.abort();
    }
    setUnsupported(false);
    setLoading(true);
    setError(null);
    pack.listInstancesByFormula(
      { driver: bdClient, workspace, signal: ctrl.signal },
      formulaName,
    )
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
      {unsupported && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 12 }}>
          Instances view not supported by the active orchestrator pack.
        </div>
      )}
      {error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 12 }}>
          Instances data unavailable — couldn't reach bd. {error}
        </div>
      )}
      {!error && !unsupported && instances.length === 0 && (
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
              <span className="at">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
