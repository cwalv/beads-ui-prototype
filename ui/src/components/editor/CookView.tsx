import { useState, useEffect, useCallback } from 'react';
import { cookFormula } from '../../client/formula';
import { useDebounced } from '../../hooks/useDebounced';
import type { VarDef } from '../../lib/formula-parse';
import type { CookStep } from '../../client/formula';

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

interface Props {
  formulaName: string;
  vars: Record<string, VarDef>;
  workspace: string;
  hasParseErrors: boolean;
}

function renderWithHighlight(str: string, vars: Record<string, string>): React.ReactNode {
  const parts = String(str).split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\})/);
  return parts.map((p, i) => {
    const m = p.match(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/);
    if (m) {
      const v = vars[m[1]];
      if (v !== undefined && v !== '') return <span key={i} className="resolved">{v}</span>;
      return <span key={i} style={{ color: 'var(--mute-2)' }}>{p}</span>;
    }
    return p;
  });
}

export function CookView({ formulaName, vars, workspace, hasParseErrors }: Props) {
  const [cookVars, setCookVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.values(vars).forEach(v => {
      if (v.default != null) init[v.name] = String(v.default);
    });
    return init;
  });
  const [steps, setSteps] = useState<CookStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedVars = useDebounced(cookVars, 250);

  const cook = useCallback(async (signal: AbortSignal) => {
    if (!BASE_URL) return;
    if (hasParseErrors) return;
    setLoading(true);
    setError(null);
    try {
      const result = await cookFormula(formulaName, debouncedVars, workspace, signal);
      if (!signal.aborted) setSteps(result);
    } catch (e: unknown) {
      if (signal.aborted) return;
      const err = e as { message?: string };
      setError(err.message ?? 'Cook failed');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [formulaName, debouncedVars, workspace, hasParseErrors]);

  useEffect(() => {
    const ctrl = new AbortController();
    cook(ctrl.signal);
    return () => ctrl.abort();
  }, [cook]);

  if (!BASE_URL) {
    return (
      <div className="ed-cook-disabled">
        <span>bd-server not reachable</span>
        <span style={{ fontSize: 11 }}>Start bd-server (VITE_BD_SERVER_URL) to preview cook output.</span>
      </div>
    );
  }

  return (
    <div className="ed-cook">
      <div className="ed-cook-form">
        <div className="ed-vars-head">
          <span className="lbl">Cook with…</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)' }}>
            {Object.values(vars).filter(v => v.required).length} required
          </span>
        </div>
        {Object.values(vars).map(v => (
          <div key={v.name} className="ed-var">
            <div className="row">
              <span className="name">{v.name}</span>
              {v.required && <span className="req">required</span>}
            </div>
            <input
              type="text"
              value={cookVars[v.name] ?? ''}
              onChange={e => setCookVars(prev => ({ ...prev, [v.name]: e.target.value }))}
              placeholder={v.default != null ? String(v.default) : '(empty)'}
            />
          </div>
        ))}
      </div>

      <div className="ed-cook-preview">
        {hasParseErrors && (
          <div className="ed-loading">Fix parse errors in the Source pane before cooking.</div>
        )}
        {!hasParseErrors && error && (
          <div className="ed-loading" style={{ color: 'var(--danger)' }}>
            Couldn't cook: {error}
          </div>
        )}
        {!hasParseErrors && !error && loading && steps.length === 0 && (
          <div className="ed-loading">Cooking…</div>
        )}
        {!hasParseErrors && !error && steps.length > 0 && (
          <div className="ed-cook-card">
            <div className="ed-cook-card-head">
              <div className="ed-cook-card-kind">Proto · poured from {formulaName}</div>
              <div className="ed-cook-card-title">
                {cookVars.kind || 'feat'}
                {cookVars.scope ? `(${cookVars.scope})` : ''}
                {cookVars.title ? `: ${cookVars.title}` : ': (title)'}
              </div>
              <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>
                {steps.length} steps · target: {cookVars.upstream_owner || '?'}/{cookVars.upstream_repo || '?'}
              </div>
            </div>
            <div className="ed-cook-card-body">
              {steps.map((s, i) => (
                <div key={s.id || i} className="ed-cook-step">
                  <span className="idx">{i + 1}</span>
                  <div>
                    <div className="id">{s.id}</div>
                    <div className="t">{renderWithHighlight(s.title || '', cookVars)}</div>
                    {s.needs.length > 0 && (
                      <div className="needs">needs: {s.needs.join(', ')}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
