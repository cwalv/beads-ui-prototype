import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useWorkspace } from '../../hooks/useWorkspace';
import { createBead } from '../../client/bead';
import { addDep } from '../../client/bead';
import { StubBanner } from '../../components/chrome/StubBanner';
import type { Destination, BeadType, DepType, Bead } from '../../types';

export const handle = {
  destination: 'capture' as Destination,
  breadcrumb: ['capture'],
};

const TYPES: BeadType[] = ['bug', 'feature', 'task', 'chore', 'epic', 'message'];
const PRIORITIES = [0, 1, 2, 3, 4];
const PICK_DEP_TYPES: DepType[] = ['blocks', 'parent-child', 'waits-for', 'related', 'discovered-from'];

const DEP_LABEL: Record<string, string> = {
  blocks: 'blocks',
  'parent-child': 'parent-of',
  'waits-for': 'waits-for',
  related: 'related',
  'discovered-from': 'discovered-from',
};

interface DepEntry { key: string; depType: DepType; targetId: string; }
interface OptSection { open: boolean; value: string; }

function initialOptionals(): Record<string, OptSection> {
  return {
    design: { open: false, value: '' },
    acceptance_criteria: { open: false, value: '' },
    notes: { open: false, value: '' },
  };
}

function depChipStyle(dt: DepType): React.CSSProperties {
  return dt === 'blocks'
    ? { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'transparent' }
    : { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' };
}

export default function Capture() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { current } = useWorkspace();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [optionals, setOptionals] = useState(initialOptionals);
  const [type, setType] = useState<BeadType>('task');
  const [priority, setPriority] = useState(2);
  const [assignee, setAssignee] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [deps, setDeps] = useState<DepEntry[]>([]);
  const [newDepType, setNewDepType] = useState<DepType>('blocks');
  const [newDepId, setNewDepId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  // fo-zz4pz §5: Expand to epic dialog state
  const [epicDialogOpen, setEpicDialogOpen] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<((andNew: boolean) => Promise<void>) | null>(null);

  const wsParam = searchParams.get('ws') ?? current?.name ?? '';
  const authorHref = `/author${wsParam ? `?ws=${wsParam}` : ''}`;

  const footLeft = title.trim()
    ? '1 bead pending · ⌘↵ save & new · esc to discard'
    : 'new bead · ⌘↵ save & new · esc to discard';
  useSetFooter(submitting ? 'creating bead…' : footLeft, 'Capture · single bead');

  useEffect(() => { titleRef.current?.focus(); }, []);

  function reset() {
    setTitle('');
    setDescription('');
    setOptionals(initialOptionals());
    setType('task');
    setPriority(2);
    setAssignee('');
    setLabels([]);
    setLabelInput('');
    setExternalRef('');
    setDeps([]);
    setNewDepType('blocks');
    setNewDepId('');
    setSubmitError(null);
    setTimeout(() => titleRef.current?.focus(), 0);
  }

  const doSubmit = useCallback(async (andNew: boolean) => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    let created: Bead | null = null;
    try {
      created = await createBead({
        title: title.trim(),
        description: description.trim() || undefined,
        design: optionals.design.value.trim() || undefined,
        acceptanceCriteria: optionals.acceptance_criteria.value.trim() || undefined,
        notes: optionals.notes.value.trim() || undefined,
        type,
        priority,
        assignee: assignee.trim() || undefined,
        labels: labels.length > 0 ? labels : undefined,
        externalRef: externalRef.trim() || undefined,
        workspace: current?.name,
      });
      setLastCreated(created.id);
      for (const dep of deps) {
        await addDep(created.id, dep.targetId, dep.depType);
      }
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e);
      setSubmitError(msg);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (andNew) {
      reset();
    } else if (created) {
      navigate(`/bead/${created.id}${wsParam ? `?ws=${wsParam}` : ''}`);
    }
  }, [title, description, optionals, type, priority, assignee, labels, externalRef, deps, current, submitting, wsParam, navigate]);

  submitRef.current = doSubmit;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        navigate(authorHref);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitRef.current?.(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, authorHref]);

  function addDepEntry() {
    const id = newDepId.trim();
    if (!id) return;
    setDeps(prev => [...prev, { key: `${Date.now()}-${id}`, depType: newDepType, targetId: id }]);
    setNewDepId('');
  }

  function addLabel() {
    const l = labelInput.trim();
    if (!l || labels.includes(l)) return;
    setLabels(prev => [...prev, l]);
    setLabelInput('');
  }

  function toggleOptional(key: string) {
    setOptionals(prev => ({ ...prev, [key]: { ...prev[key], open: !prev[key].open } }));
  }

  const canSubmit = title.trim().length > 0 && !submitting;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
      {/* Mode bar */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', padding: '0 20px',
        borderBottom: '1px solid var(--rule)', background: 'var(--bg-2)', flexShrink: 0, gap: 10,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>
          New bead
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)',
          padding: '1px 5px', background: 'var(--bg-3)', border: '1px solid var(--rule-2)', borderRadius: 2,
        }}>⌘N</span>

        <span style={{ flex: 1 }} />

        {current && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)', display: 'flex', alignItems: 'center', gap: 4 }}>
            dest ·{' '}
            <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }}>
              {current.name}
            </span>
          </span>
        )}

        <button
          onClick={() => doSubmit(true)}
          disabled={!canSubmit}
          style={{
            border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
            padding: '4px 12px', fontSize: 11.5, color: canSubmit ? 'var(--ink-2)' : 'var(--mute)',
            cursor: canSubmit ? 'pointer' : 'default', fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Save &amp; new
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--mute)' }}>⌘↵</span>
        </button>

        <button
          onClick={() => doSubmit(false)}
          disabled={!canSubmit}
          data-testid="create-bead-btn"
          style={{
            border: '1px solid var(--accent)', borderRadius: 2, background: 'var(--accent)',
            padding: '4px 14px', fontSize: 11.5, color: 'var(--on-strong)',
            cursor: canSubmit ? 'pointer' : 'default', fontFamily: 'var(--font-sans)',
            opacity: canSubmit ? 1 : 0.55,
          }}
        >
          {submitting ? 'Creating…' : 'Create bead'}
        </button>
      </div>

      {/* Success toast */}
      {lastCreated && !submitting && (
        <div style={{
          padding: '6px 20px', background: 'var(--ok-soft)', borderBottom: '1px solid var(--ok)',
          fontSize: 11.5, color: 'var(--ok)', fontFamily: 'var(--font-mono)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          Created {lastCreated}
          <button
            onClick={() => setLastCreated(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ok)', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >×</button>
        </div>
      )}

      {/* Error banner */}
      {submitError && (
        <div style={{
          padding: '6px 20px', background: 'var(--danger-soft)', borderBottom: '1px solid var(--danger)',
          fontSize: 11.5, color: 'var(--danger)', fontFamily: 'var(--font-mono)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {submitError}
          <button
            onClick={() => setSubmitError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >×</button>
        </div>
      )}

      {/* Body: left form + right rail */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', minHeight: 0, overflow: 'hidden' }}>

        {/* Left — main form */}
        <div style={{ padding: '24px 36px', overflow: 'auto' }}>
          <div style={{ maxWidth: 680 }}>

            {/* Title */}
            <div style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
            }}>title</div>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              data-testid="title-input"
              style={{
                width: '100%', padding: '10px 0', fontSize: 22, fontWeight: 500,
                border: 'none', borderBottom: '1px solid var(--rule)', outline: 'none',
                background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--font-sans)',
              }}
            />

            {/* Description */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)',
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
              }}>description</div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Why this matters and what done looks like."
                data-testid="description-input"
                style={{
                  width: '100%', minHeight: 120, padding: 10, fontSize: 13, lineHeight: 1.55,
                  border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
                  outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)', color: 'var(--ink)',
                }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                markdown · supports {'{bead-id}'} links
              </div>
            </div>

            {/* Optional expandable sections */}
            <div style={{ marginTop: 18, border: '1px solid var(--rule)', borderRadius: 2 }}>
              {(['design', 'acceptance_criteria', 'notes'] as const).map((key, i) => {
                const sec = optionals[key];
                const isLast = i === 2;
                return (
                  <div key={key}>
                    <div
                      onClick={() => toggleOptional(key)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: (!isLast || sec.open) ? '1px solid var(--rule-2)' : 'none',
                        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: 'var(--mute-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {sec.open ? '−' : '+'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>
                        {key}
                      </span>
                      <span style={{ flex: 1 }} />
                      {!sec.open && (
                        <span style={{ fontSize: 10.5, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
                          optional · add later
                        </span>
                      )}
                    </div>
                    {sec.open && (
                      <div style={{ padding: '10px 14px', borderBottom: !isLast ? '1px solid var(--rule-2)' : 'none' }}>
                        <textarea
                          value={sec.value}
                          onChange={e => setOptionals(prev => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                          style={{
                            width: '100%', minHeight: 80, padding: 8, fontSize: 12.5, lineHeight: 1.55,
                            border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
                            outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)', color: 'var(--ink)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dependencies */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)',
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
              }}>dependencies</div>

              {deps.map(dep => (
                <div key={dep.key} style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr 24px',
                  gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--rule-2)',
                }}>
                  <span className="chip" style={depChipStyle(dep.depType)}>
                    {DEP_LABEL[dep.depType] ?? dep.depType}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)' }}>
                    {dep.targetId}
                  </span>
                  <button
                    onClick={() => setDeps(prev => prev.filter(d => d.key !== dep.key))}
                    style={{ background: 'none', border: 'none', color: 'var(--mute-2)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}
                  >×</button>
                </div>
              ))}

              {/* Dep-type picker */}
              <div style={{ padding: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>+ add dep ·</span>
                {PICK_DEP_TYPES.map(dt => (
                  <span
                    key={dt}
                    className="chip"
                    onClick={() => setNewDepType(dt)}
                    style={{
                      cursor: 'pointer',
                      ...(newDepType === dt
                        ? { background: 'var(--ink)', color: 'var(--on-strong)', borderColor: 'var(--ink)' }
                        : {}),
                    }}
                  >
                    {DEP_LABEL[dt]}
                  </span>
                ))}
              </div>

              {/* Target bead ID input */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={newDepId}
                  onChange={e => setNewDepId(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDepEntry(); } }}
                  placeholder="bead id (e.g. fo-abc12)"
                  data-testid="dep-id-input"
                  style={{
                    flex: 1, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
                    border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
                <button
                  onClick={addDepEntry}
                  disabled={!newDepId.trim()}
                  style={{
                    padding: '4px 10px', fontSize: 11, border: '1px solid var(--rule)', borderRadius: 2,
                    background: 'var(--bg)', color: 'var(--ink-3)',
                    cursor: newDepId.trim() ? 'pointer' : 'default',
                    opacity: newDepId.trim() ? 1 : 0.5,
                  }}
                >add</button>
              </div>
            </div>
          </div>

          {/* fo-zz4pz §5: Expand to epic — stub button for the second-click formula-pour action */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--rule-2)' }}>
            <button
              onClick={() => setEpicDialogOpen(true)}
              style={{
                padding: '8px 18px',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                border: '1px solid var(--rule)',
                borderRadius: 2,
                background: 'var(--bg)',
                color: 'var(--ink-3)',
                cursor: 'pointer',
              }}
            >
              Expand to epic …
            </button>
            <span style={{
              marginLeft: 10,
              fontSize: 10.5,
              color: 'var(--mute)',
              fontFamily: 'var(--font-mono)',
            }}>
              pour a formula to turn this bead into a molecule
            </span>
          </div>
        </div>

        {/* Right rail */}
        <div style={{
          borderLeft: '1px solid var(--rule)', background: 'var(--bg-2)',
          padding: '18px 20px', overflow: 'auto', flexShrink: 0,
        }}>

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 18 }}>
            {TYPES.map(t => (
              <span
                key={t}
                className="chip"
                onClick={() => setType(t)}
                style={{
                  cursor: 'pointer',
                  ...(type === t ? { background: 'var(--ink)', color: 'var(--on-strong)', borderColor: 'var(--ink)' } : {}),
                }}
              >
                {t}
              </span>
            ))}
          </div>

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Priority</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
            {PRIORITIES.map(p => (
              <span
                key={p}
                className="chip"
                onClick={() => setPriority(p)}
                style={{
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  ...(priority === p ? { background: 'var(--ink)', color: 'var(--on-strong)', borderColor: 'var(--ink)' } : {}),
                }}
              >P{p}</span>
            ))}
          </div>

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Assignee</div>
          <input
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            placeholder="@username"
            style={{
              width: '100%', padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
              border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
              color: 'var(--ink)', outline: 'none', marginBottom: 18, boxSizing: 'border-box',
            }}
          />

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Labels</div>
          {labels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {labels.map(l => (
                <span
                  key={l}
                  className="chip"
                  onClick={() => setLabels(prev => prev.filter(x => x !== l))}
                  title="Click to remove"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent', cursor: 'pointer' }}
                >
                  {l} ×
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            <input
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
              placeholder="add label…"
              style={{
                flex: 1, padding: '4px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
                border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
                color: 'var(--ink)', outline: 'none',
              }}
            />
            <button
              onClick={addLabel}
              style={{
                padding: '2px 8px', fontSize: 11, border: '1px solid var(--rule)', borderRadius: 2,
                background: 'var(--bg)', color: 'var(--ink-3)', cursor: 'pointer',
              }}
            >+</button>
          </div>

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>External ref</div>
          <input
            value={externalRef}
            onChange={e => setExternalRef(e.target.value)}
            placeholder="issue URL / PR / doc"
            style={{
              width: '100%', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-mono)',
              border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
              color: 'var(--ink)', outline: 'none', marginBottom: 18, boxSizing: 'border-box',
            }}
          />

          <div style={{
            fontSize: 10.5, color: 'var(--mute)', lineHeight: 1.55,
            fontFamily: 'var(--font-mono)', paddingTop: 12, borderTop: '1px solid var(--rule-2)',
          }}>
            creates a single bead. if this work needs phases, a formula will later be poured to turn it into a molecule.
          </div>
        </div>
      </div>

      {/* fo-zz4pz §5: Expand to epic stub dialog */}
      {epicDialogOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--scrim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}
          onClick={() => setEpicDialogOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--rule)',
              maxWidth: 560, width: '90%', position: 'relative', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setEpicDialogOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
                color: 'var(--mute)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px',
              }}
            >×</button>
            <StubBanner
              title="Expand to epic"
              description="Second-click action that pours a formula, turning a captured bead into a molecule."
              bead="fo-zz4pz"
              prototypeRef="UI-DESIGN.md §Capture"
            />
          </div>
        </div>
      )}
    </div>
  );
}
