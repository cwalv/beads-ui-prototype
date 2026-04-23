import { useCallback, useMemo } from 'react';
import type { FormulaSchema } from '../../client/schema';
import { HintDot } from '../../components/ui/HintDot';
import { getConcept } from '../../data/concepts';
import type { ParsedFormula } from '../../lib/formula-parse';
import {
  writeTopLevel,
  writeDescription,
  writeVarField,
  addVar,
  removeVar,
  extractDescription,
} from '../../lib/formula-write';
import { ChipList } from '../../components/editor/form/ChipList';

interface Props {
  src: string;
  setSrc: (src: string) => void;
  parsed: ParsedFormula;
  schema: FormulaSchema | null;
  schemaError: string | null;
  formulaName: string;
  onJumpToSource: (stepId: string | null, line?: number) => void;
}

export function FormView({ src, setSrc, parsed, schema, schemaError, formulaName, onJumpToSource }: Props) {
  const description = useMemo(() => extractDescription(src), [src]);

  const topLevelFields = schema?.topLevel ?? [];
  const schemaField = (key: string) => topLevelFields.find(f => f.key === key) ?? null;

  const onTopLevel = useCallback((key: string, value: string | number | boolean | string[]) => {
    if (key === 'description') {
      setSrc(writeDescription(src, String(value)));
    } else {
      setSrc(writeTopLevel(src, key, value));
    }
  }, [src, setSrc]);

  const onVarField = useCallback((varName: string, field: string, value: string | number | boolean) => {
    setSrc(writeVarField(src, varName, field, value));
  }, [src, setSrc]);

  const onAddVar = useCallback(() => {
    const name = prompt('New var name (e.g. my_var):');
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim())) return;
    const trimmed = name.trim();
    if (parsed.vars[trimmed]) return;
    setSrc(addVar(src, trimmed));
  }, [src, setSrc, parsed.vars]);

  const onRemoveVar = useCallback((varName: string) => {
    setSrc(removeVar(src, varName));
  }, [src, setSrc]);

  const vars = Object.values(parsed.vars);

  return (
    <div className="fm-root">
      {/* ─── Header section ─── */}
      <section className="fm-section">
        <div className="fm-section-head">
          <span className="fm-section-label">Header</span>
          {schemaError && (
            <span className="fm-schema-err" title={schemaError}>schema unavailable — read-only fallback</span>
          )}
        </div>
        <div className="fm-section-body">
          {/* formula — always read-only */}
          <FormRow label="formula" hint="matches filename stem">
            <input
              type="text"
              className="fm-input"
              value={String(parsed.header.formula ?? formulaName)}
              readOnly
              title="formula name must match the filename stem"
            />
          </FormRow>

          {/* description */}
          <FormRow label="description">
            <textarea
              className="fm-textarea"
              value={description}
              readOnly={!schema}
              rows={6}
              onChange={e => onTopLevel('description', e.target.value)}
            />
          </FormRow>

          {/* kind */}
          {(() => {
            const f = schemaField('kind');
            const cur = String(parsed.header.kind ?? '');
            if (!schema) {
              return cur ? <FormRow label="kind"><span className="fm-value">{cur}</span></FormRow> : null;
            }
            if (!f) return null;
            if (f.type === 'enum' && f.enum) {
              return (
                <FormRow label="kind">
                  <select
                    className="fm-select"
                    value={cur}
                    onChange={e => onTopLevel('kind', e.target.value)}
                  >
                    <option value="">— unset —</option>
                    {f.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </FormRow>
              );
            }
            return (
              <FormRow label="kind">
                <input type="text" className="fm-input" value={cur}
                  onChange={e => onTopLevel('kind', e.target.value)} />
              </FormRow>
            );
          })()}

          {/* extends */}
          {(() => {
            const f = schemaField('extends');
            const raw = parsed.header.extends;
            const cur: string[] = Array.isArray(raw) ? raw.map(String) : (raw ? [String(raw)] : []);
            if (!schema) {
              return cur.length ? <FormRow label="extends"><span className="fm-value">{cur.join(', ')}</span></FormRow> : null;
            }
            if (!f) return null;
            if (f.type === 'string[]') {
              return (
                <FormRow label="extends">
                  <ChipList values={cur} onChange={v => onTopLevel('extends', v)} placeholder="formula name" />
                </FormRow>
              );
            }
            return (
              <FormRow label="extends">
                <input type="text" className="fm-input" value={cur[0] ?? ''}
                  onChange={e => onTopLevel('extends', e.target.value)} />
              </FormRow>
            );
          })()}

          {/* contract */}
          {(() => {
            const f = schemaField('contract');
            const cur = String(parsed.header.contract ?? '');
            if (!schema) {
              return cur ? <FormRow label="contract"><span className="fm-value">{cur}</span></FormRow> : null;
            }
            if (!f) return null;
            if (f.type === 'enum' && f.enum) {
              return (
                <FormRow label="contract">
                  <select
                    className="fm-select"
                    value={cur}
                    onChange={e => onTopLevel('contract', e.target.value)}
                  >
                    <option value="">— unset —</option>
                    {f.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </FormRow>
              );
            }
            return (
              <FormRow label="contract">
                <input type="text" className="fm-input" value={cur}
                  onChange={e => onTopLevel('contract', e.target.value)} />
              </FormRow>
            );
          })()}

          {/* Any other schema topLevel fields present in parsed.header */}
          {schema && topLevelFields
            .filter(f => !['formula', 'description', 'kind', 'extends', 'contract'].includes(f.key))
            .filter(f => parsed.header[f.key] !== undefined)
            .map(f => {
              const val = String(parsed.header[f.key] ?? '');
              return (
                <FormRow key={f.key} label={f.key}>
                  <input type="text" className="fm-input" value={val}
                    onChange={e => onTopLevel(f.key, e.target.value)} />
                </FormRow>
              );
            })}
        </div>
      </section>

      {/* ─── Vars section ─── */}
      <section className="fm-section">
        <div className="fm-section-head">
          <span className="fm-section-label">Vars</span>
          <span className="fm-section-meta">{vars.length} defined</span>
        </div>
        <div className="fm-section-body fm-vars-body">
          {vars.length === 0 && (
            <div className="fm-empty">No vars defined</div>
          )}
          {vars.length > 0 && (
            <table className="fm-var-table">
              <thead>
                <tr>
                  <th>name</th>
                  <th>default</th>
                  <th>description</th>
                  <th>req</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vars.map(v => (
                  <VarRow
                    key={v.name}
                    v={v}
                    onChange={onVarField}
                    onRemove={schema ? onRemoveVar : undefined}
                  />
                ))}
              </tbody>
            </table>
          )}
          {schema && (
            <button className="fm-add-var" onClick={onAddVar}>+ add var</button>
          )}
        </div>
      </section>

      {/* ─── Steps section ─── */}
      <section className="fm-section">
        <div className="fm-section-head">
          <span className="fm-section-label">Steps</span>
          <span className="fm-section-meta">{parsed.steps.length} steps · read-only</span>
        </div>
        <div className="fm-section-body fm-steps-body">
          {parsed.steps.length === 0 && (
            <div className="fm-empty">No steps defined</div>
          )}
          {parsed.steps.map((step, idx) => {
            const range = parsed.stepRanges[idx];
            return (
              <div
                key={step.id ?? idx}
                className="fm-step-row"
                role="button"
                tabIndex={0}
                onClick={() => onJumpToSource(step.id, range?.startLine)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onJumpToSource(step.id, range?.startLine); }}
                title="Click to jump to source"
              >
                <span className="fm-step-idx">{idx + 1}</span>
                <div className="fm-step-body">
                  <span className="fm-step-id">{step.id ?? '(no id)'}</span>
                  {step.title && <span className="fm-step-title">{step.title}</span>}
                </div>
                <div className="fm-step-badges">
                  {step.needs.length > 0 && (
                    <span className="fm-badge">{step.needs.length} dep{step.needs.length > 1 ? 's' : ''}</span>
                  )}
                  {step.retry && (
                    <span className="fm-badge">retry ×{step.retry.max_attempts ?? '?'}</span>
                  )}
                </div>
                <span className="fm-step-goto">→ source</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Small helpers ──

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function FormRow({ label, hint, children }: RowProps) {
  const hasConcept = !!getConcept(label);
  return (
    <div className="fm-row">
      <label className="fm-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        {hint && <span className="fm-hint"> ({hint})</span>}
        {hasConcept && <HintDot conceptKey={label} />}
      </label>
      <div className="fm-field">{children}</div>
    </div>
  );
}

interface VarRowProps {
  v: { name: string; default: string | number | boolean | null; description: string; required: boolean };
  onChange: (varName: string, field: string, value: string | number | boolean) => void;
  onRemove?: (varName: string) => void;
}

function VarRow({ v, onChange, onRemove }: VarRowProps) {
  const defVal = v.default !== null ? String(v.default) : '';
  return (
    <tr className="fm-var-row">
      <td><span className="fm-var-name">{v.name}</span></td>
      <td>
        {/* TODO fo-zz4pz §8: var form schema — [vars.X.ui] type hints (path/enum/bool/select) should drive typed widgets here once bd-server /v1/formula-schema exposes a UI section */}
        <input
          type="text"
          className="fm-input fm-input-sm"
          value={defVal}
          placeholder="(none)"
          onChange={e => onChange(v.name, 'default', e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className="fm-input fm-input-sm"
          value={v.description}
          onChange={e => onChange(v.name, 'description', e.target.value)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={v.required}
          onChange={e => onChange(v.name, 'required', e.target.checked)}
          style={{ accentColor: 'var(--ink)' }}
        />
      </td>
      <td>
        {onRemove && (
          <button
            className="fm-rm-btn"
            onClick={() => onRemove(v.name)}
            title={`Remove var ${v.name}`}
          >×</button>
        )}
      </td>
    </tr>
  );
}
