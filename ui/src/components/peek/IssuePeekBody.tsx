import { useState, useEffect, useCallback } from 'react';
import type { Bead, DepType } from '../../types';
import { getBead, updateBead, addComment, addDep, removeDep } from '../../client/bead';

interface Props {
  beadId: string;
  onClose: () => void;
  onNodePatch?: (id: string, patch: Partial<{ title: string; status: string; priority: number }>) => void;
}

type Tab = 'Overview' | 'Deps' | 'Comments' | 'Events';
const TABS: Tab[] = ['Overview', 'Deps', 'Comments', 'Events'];

const DEP_TYPES: DepType[] = ['tracks', 'blocks', 'parent-child', 'waits-for', 'conditional-blocks', 'related', 'discovered-from'];

function Shimmer() {
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[80, 120, 60, 100].map((w, i) => (
        <div key={i} style={{ height: 14, width: w, background: 'var(--bg-3)', borderRadius: 3 }} />
      ))}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '4px 0', alignItems: 'start' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

export function IssuePeekBody({ beadId, onClose: _onClose, onNodePatch }: Props) {
  const [bead, setBead] = useState<Bead | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [editMode, setEditMode] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDesign, setEditDesign] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAcceptance, setEditAcceptance] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);

  const [newDepId, setNewDepId] = useState('');
  const [newDepType, setNewDepType] = useState<DepType>('tracks');
  const [depError, setDepError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const b = await getBead(beadId);
      setBead(b);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [beadId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!bead) return;
    setEditTitle(bead.title ?? '');
    setEditDesc(bead.description ?? '');
    setEditDesign(bead.design ?? '');
    setEditNotes(bead.notes ?? '');
    setEditAcceptance(bead.acceptance_criteria ?? '');
    setEditStatus(bead.status ?? '');
    setEditPriority(bead.priority !== undefined ? String(bead.priority) : '');
    setEditAssignee(bead.assignee ?? '');
    setSaveError(null);
    setEditMode(true);
  }

  async function handleSave() {
    if (!bead) return;
    setSaveError(null);
    const patch: Parameters<typeof updateBead>[1] = {};
    if (editTitle !== bead.title) patch.title = editTitle;
    if (editDesc !== (bead.description ?? '')) patch.description = editDesc;
    if (editDesign !== (bead.design ?? '')) patch.design = editDesign;
    if (editNotes !== (bead.notes ?? '')) patch.notes = editNotes;
    if (editAcceptance !== (bead.acceptance_criteria ?? '')) patch.acceptance = editAcceptance;
    if (editStatus !== bead.status) patch.status = editStatus;
    if (editPriority !== '' && Number(editPriority) !== bead.priority) patch.priority = Number(editPriority);
    if (editAssignee !== (bead.assignee ?? '')) patch.assignee = editAssignee;

    const prevBead = bead;
    const optimistic: Bead = {
      ...bead,
      title: editTitle || bead.title,
      description: editDesc || undefined,
      design: editDesign || undefined,
      notes: editNotes || undefined,
      acceptance_criteria: editAcceptance || undefined,
      status: (editStatus as Bead['status']) || bead.status,
      priority: editPriority !== '' ? Number(editPriority) : bead.priority,
      assignee: editAssignee || undefined,
    };
    setBead(optimistic);
    setEditMode(false);

    try {
      await updateBead(beadId, patch);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
      if (onNodePatch) {
        const nodePatch: Partial<{ title: string; status: string; priority: number }> = {};
        if (patch.title !== undefined) nodePatch.title = patch.title;
        if (patch.status !== undefined) nodePatch.status = patch.status;
        if (patch.priority !== undefined) nodePatch.priority = patch.priority;
        onNodePatch(beadId, nodePatch);
      }
    } catch (e) {
      setBead(prevBead);
      setEditMode(true);
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddDep() {
    if (!newDepId.trim()) return;
    setDepError(null);
    try {
      await addDep(beadId, newDepId.trim(), newDepType);
      setNewDepId('');
      await load();
    } catch (e) {
      setDepError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveDep(targetId: string) {
    setDepError(null);
    try {
      await removeDep(beadId, targetId);
      await load();
    } catch (e) {
      setDepError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddComment() {
    if (!commentBody.trim()) return;
    setCommentError(null);
    try {
      await addComment(beadId, commentBody.trim());
      setCommentBody('');
      await load();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <Shimmer />;

  if (fetchError) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{
          background: 'var(--warn-soft)',
          border: '1px solid var(--warn)',
          borderRadius: 2,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--warn)',
          marginBottom: 8,
        }}>
          {fetchError}
        </div>
        <button onClick={load} style={{ fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  if (!bead) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--rule-2)',
        background: 'var(--bg)',
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 12px',
              fontSize: 11.5,
              fontFamily: 'var(--font-sans)',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab ? 'var(--ink)' : 'var(--mute)',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab}
          </button>
        ))}
        {activeTab === 'Overview' && (
          <button
            onClick={editMode ? handleSave : startEdit}
            style={{
              marginLeft: 'auto',
              marginRight: 8,
              fontSize: 11,
              padding: '3px 10px',
              border: '1px solid var(--rule)',
              borderRadius: 2,
              background: editMode ? 'var(--accent)' : 'var(--bg)',
              color: editMode ? '#fff' : 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            {editMode ? 'Save' : 'Edit'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {saveFlash && (
          <div style={{
            background: 'var(--ok-soft)',
            border: '1px solid var(--ok)',
            borderRadius: 2,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--ok)',
            marginBottom: 8,
          }}>
            Saved
          </div>
        )}
        {saveError && (
          <div style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            borderRadius: 2,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--warn)',
            marginBottom: 8,
          }}>
            {saveError}
          </div>
        )}

        {activeTab === 'Overview' && !editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <KVRow label="id" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{bead.id}</span>} />
            <KVRow label="title" value={bead.title} />
            <KVRow label="status" value={bead.status} />
            <KVRow label="type" value={bead.type} />
            <KVRow label="priority" value={bead.priority !== undefined ? `p${bead.priority}` : undefined} />
            <KVRow label="assignee" value={bead.assignee} />
            <KVRow label="labels" value={bead.labels?.join(', ')} />
            <KVRow label="external ref" value={bead.external_ref} />
            {bead.description && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>description</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bead.description}</div>
              </div>
            )}
            {bead.design && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>design</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bead.design}</div>
              </div>
            )}
            {bead.acceptance_criteria && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>acceptance</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bead.acceptance_criteria}</div>
              </div>
            )}
            {bead.notes && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>notes</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bead.notes}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Overview' && editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>title</span>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ fontSize: 12.5, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>status</span>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2 }}
              >
                {['open', 'in_progress', 'blocked', 'deferred', 'closed'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>priority</span>
              <input
                type="number"
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
                min={0}
                max={4}
                style={{ fontSize: 12.5, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, width: 60 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>assignee</span>
              <input
                value={editAssignee}
                onChange={e => setEditAssignee(e.target.value)}
                style={{ fontSize: 12.5, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>description</span>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={4}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>design</span>
              <textarea
                value={editDesign}
                onChange={e => setEditDesign(e.target.value)}
                rows={3}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>acceptance</span>
              <textarea
                value={editAcceptance}
                onChange={e => setEditAcceptance(e.target.value)}
                rows={3}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>notes</span>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
            </label>
          </div>
        )}

        {activeTab === 'Deps' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {depError && (
              <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', borderRadius: 2, padding: '4px 10px', fontSize: 11, color: 'var(--warn)' }}>
                {depError}
              </div>
            )}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 6, fontWeight: 600 }}>
                depends on (→)
              </div>
              {(bead.dependencies ?? []).length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>none</div>
              )}
              {(bead.dependencies ?? []).map(dep => (
                <div key={dep.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, padding: '3px 0', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{dep.dependency_type}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>{dep.id}</span>
                  <button
                    onClick={() => handleRemoveDep(dep.id)}
                    style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 6, fontWeight: 600 }}>
                depended on by (←)
              </div>
              {(bead.dependents ?? []).length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>none</div>
              )}
              {(bead.dependents ?? []).map(dep => (
                <div key={dep.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, padding: '3px 0', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{dep.dependency_type}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>{dep.id}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--rule-2)', paddingTop: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 6 }}>Add dependency</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder="target id"
                  value={newDepId}
                  onChange={e => setNewDepId(e.target.value)}
                  style={{ fontSize: 11.5, padding: '3px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-mono)', width: 110 }}
                />
                <select
                  value={newDepType}
                  onChange={e => setNewDepType(e.target.value as DepType)}
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--rule)', borderRadius: 2 }}
                >
                  {DEP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={handleAddDep}
                  style={{ fontSize: 11, padding: '3px 10px', border: '1px solid var(--accent)', borderRadius: 2, background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer' }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {commentError && (
              <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', borderRadius: 2, padding: '4px 10px', fontSize: 11, color: 'var(--warn)' }}>
                {commentError}
              </div>
            )}
            {(bead.comments ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--mute)' }}>No comments yet.</div>
            )}
            {(bead.comments ?? []).map(c => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--rule-2)', paddingBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-2)' }}>{c.author ?? 'anon'}</span>
                  {c.created_at && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{c.created_at}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.text}</div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--rule-2)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                placeholder="Add a comment…"
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                rows={3}
                style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
              <button
                onClick={handleAddComment}
                style={{ alignSelf: 'flex-end', fontSize: 11, padding: '3px 12px', border: '1px solid var(--accent)', borderRadius: 2, background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer' }}
              >
                Add comment
              </button>
            </div>
          </div>
        )}

        {activeTab === 'Events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(bead.events ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--mute)' }}>No events.</div>
            )}
            {(bead.events ?? []).map(ev => (
              <div key={ev.id} style={{ borderBottom: '1px solid var(--rule-2)', paddingBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{ev.event_type}</span>
                  {ev.actor && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>{ev.actor}</span>}
                  {ev.created_at && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{ev.created_at}</span>}
                </div>
                {ev.comment && <div style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'pre-wrap' }}>{ev.comment}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
