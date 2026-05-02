import { useCallback, useMemo, useState, useRef } from 'react';
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
  writeStepField,
  renameStepId,
  addStep,
  removeStep,
  moveStep,
  extractStepDescription,
} from '../../lib/formula-write';
import { ChipList } from '../../components/editor/form/ChipList';
import { StepCard } from '../../components/editor/form/StepCard';

interface Props {
  src: string;
  setSrc: (src: string) => void;
  parsed: ParsedFormula;
  schema: FormulaSchema | null;
  schemaError: string | null;
  formulaName: string;
  selected?: string | null;
  onJumpToSource: (stepId: string | null, line?: number) => void;
}

export function FormView({ src, setSrc, parsed, schema, schemaError, formulaName, selected, onJumpToSource }: Props) {
  const description = useMemo(() => extractDescription(src), [src]);

  // Expanded state per step: step id → boolean. Seed from `selected`.
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => {
    if (!selected) return {};
    return { [selected]: true };
  });
  // Keep expanded open when `selected` changes externally
  const prevSelected = useRef(selected);
  if (selected && selected !== prevSelected.current) {
    prevSelected.current = selected;
    if (!expandedSteps[selected]) setExpandedSteps(prev => ({ ...prev, [selected]: true }));
  }

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const stepDescriptions = useMemo(
    () => parsed.steps.map((_, i) => extractStepDescription(src, i)),
    [src, parsed.steps],
  );

  const allStepIds = useMemo(
    () => parsed.steps.map(s => s.id).filter((id): id is string => !!id),
    [parsed.steps],
  );

  const onStepFieldChange = useCallback((stepIndex: number, field: string, value: unknown) => {
    if (field === 'id') {
      const oldId = parsed.steps[stepIndex]?.id ?? '';
      setSrc(renameStepId(src, oldId, String(value)));
      // Update expanded key if renaming
      if (oldId && oldId !== String(value)) {
        setExpandedSteps(prev => {
          const next = { ...prev };
          if (next[oldId]) { next[String(value)] = true; delete next[oldId]; }
          return next;
        });
      }
    } else {
      setSrc(writeStepField(src, stepIndex, field, value));
    }
  }, [src, setSrc, parsed.steps]);

  const onAddStep = useCallback(() => {
    const id = `step-${Date.now().toString(36)}`;
    setSrc(addStep(src, { id }));
    setExpandedSteps(prev => ({ ...prev, [id]: true }));
  }, [src, setSrc]);

  const onDeleteStep = useCallback((stepIndex: number) => {
    const id = parsed.steps[stepIndex]?.id;
    setSrc(removeStep(src, stepIndex));
    if (id) setExpandedSteps(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, [src, setSrc, parsed.steps]);

  const onMoveStep = useCallback((from: number, to: number) => {
    setSrc(moveStep(src, from, to));
  }, [src, setSrc]);

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
          <span className="fm-section-meta">{parsed.steps.length} step{parsed.steps.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="fm-steps-body">
          {parsed.steps.length === 0 && (
            <div className="fm-empty" style={{ padding: '10px 14px' }}>No steps defined</div>
          )}
          {parsed.steps.map((step, idx) => {
            const key = step.id ?? String(idx);
            const isExpanded = !!(expandedSteps[step.id ?? ''] ?? expandedSteps[String(idx)]);
            return (
              <StepCard
                key={key}
                step={step}
                index={idx}
                description={stepDescriptions[idx] ?? ''}
                expanded={isExpanded}
                allStepIds={allStepIds}
                onToggle={() => {
                  const k = step.id ?? String(idx);
                  setExpandedSteps(prev => ({ ...prev, [k]: !prev[k] }));
                }}
                onFieldChange={(field, value) => onStepFieldChange(idx, field, value)}
                onDelete={() => onDeleteStep(idx)}
                onJumpToSource={() => onJumpToSource(step.id, parsed.stepRanges[idx]?.startLine)}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragFrom(idx); }}
                onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                onDrop={e => {
                  e.preventDefault();
                  if (dragFrom !== null && dragFrom !== idx) onMoveStep(dragFrom, idx);
                  setDragFrom(null); setDragOver(null);
                }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                isDragOver={dragOver === idx}
              />
            );
          })}
          <button className="fm-add-step" onClick={onAddStep}>+ add step</button>
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
