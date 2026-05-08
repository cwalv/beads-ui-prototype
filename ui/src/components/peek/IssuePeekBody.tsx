import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Bead, Comment, DepType } from '../../types';
import { getBead, updateBead, addComment, addDep, removeDep } from '../../client/bead';
import { useOpenPeek } from '../../hooks/usePeek';
import { renderMarkdown } from '../../lib/markdown-render';

interface Props {
  beadId: string;
  workspace?: string;
  onClose: () => void;
  onNodePatch?: (id: string, patch: Partial<{ title: string; status: string; priority: number }>) => void;
  onBeadLoaded?: (bead: Bead) => void;
}

type Tab = 'Overview' | 'Deps' | 'Metadata' | 'Events';

// Full canonical dep-type set (matches `DepType` in types/index.ts).
// Convention library (fo-0qdg9) may eventually slice this per workspace,
// but for now show all 19 since bd accepts any of them.
const DEP_TYPES: DepType[] = [
  'blocks', 'parent-child', 'conditional-blocks', 'waits-for',
  'related', 'discovered-from',
  'replies-to', 'relates-to', 'duplicates', 'supersedes',
  'authored-by', 'assigned-to', 'approved-by', 'attests',
  'tracks',
  'until', 'caused-by', 'validates',
  'delegated-from',
];

const STATUS_OPTIONS = ['open', 'in_progress', 'blocked', 'deferred', 'closed', 'pinned', 'hooked'];

// Stand-in friendly labels for well-known metadata keys. The convention
// library (fo-0qdg9) will replace this with detect-then-pack lookup; for
// now we inline the gascity gc.* set plus the gastown delegated_from key
// so peek can render something more useful than raw blobs.
const METADATA_LABELS: Record<string, string> = {
  'gc.kind': 'kind',
  'gc.routed_to': 'routed to',
  'gc.attempt': 'attempt',
  'gc.molecule_id': 'molecule id',
  'gc.continuation_group': 'continuation group',
  'gc.step_ref': 'step ref',
  'gc.role_session': 'role session',
  'gc.completed_session': 'completed session',
  'gc.from': 'from',
  'gc.to': 'to',
  'gc.priority': 'gc priority',
  'gc.is_phase_2': 'phase 2',
  'gc.parent_session': 'parent session',
  'gc.target_session': 'target session',
  'gc.template': 'template',
  'gc.gate': 'gate',
  'delegated_from': 'delegated from',
};

function metadataLabel(key: string): string {
  return METADATA_LABELS[key] ?? key;
}

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
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '4px 0', alignItems: 'start' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function CommentsBlock({
  comments, error, draft, onDraftChange, onSubmit,
}: {
  comments: Comment[];
  error: string | null;
  draft: string;
  onDraftChange: (s: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--rule-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)' }}>comments</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{comments.length}</span>
      </div>
      {error && (
        <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', borderRadius: 2, padding: '4px 10px', fontSize: 11, color: 'var(--warn)', marginBottom: 6 }}>
          {error}
        </div>
      )}
      {comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--mute)', fontStyle: 'italic' }}>No comments yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.map(c => (
          <div key={c.id} style={{ borderBottom: '1px solid var(--rule-2)', paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-2)' }}>{c.author ?? 'anon'}</span>
              {c.created_at && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{formatDate(c.created_at)}</span>}
            </div>
            <div
              className="md-body"
              style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(c.text ?? '') }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          placeholder="Add a comment…"
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          rows={3}
          style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
        />
        <button
          onClick={onSubmit}
          style={{ alignSelf: 'flex-end', fontSize: 11, padding: '3px 12px', border: '1px solid var(--accent)', borderRadius: 2, background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer' }}
        >
          Add comment
        </button>
      </div>
    </div>
  );
}

function MarkdownSection({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>{title}</div>
      <div
        className="md-body"
        style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
      />
    </div>
  );
}

function formatDate(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace('T', ' ').replace(/\..*$/, '').replace(/Z$/, '');
}

function MetadataValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--mute)', fontStyle: 'italic' }}>—</span>;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{String(value)}</span>;
  }
  return (
    <pre style={{
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--ink-2)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>{JSON.stringify(value, null, 2)}</pre>
  );
}

function diffLabels(before: string[], after: string[]): { add: string[]; remove: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    add: after.filter(l => !beforeSet.has(l)),
    remove: before.filter(l => !afterSet.has(l)),
  };
}

function parseLabels(s: string): string[] {
  return s.split(',').map(l => l.trim()).filter(l => l.length > 0);
}

export function IssuePeekBody({ beadId, workspace, onClose: _onClose, onNodePatch, onBeadLoaded }: Props) {
  const { open: openPeek } = useOpenPeek();
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
  const [editLabels, setEditLabels] = useState('');
  const [editExternalRef, setEditExternalRef] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);

  const [newDepId, setNewDepId] = useState('');
  const [newDepType, setNewDepType] = useState<DepType>('blocks');
  const [depError, setDepError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const b = await getBead(beadId, workspace);
      setBead(b);
      onBeadLoaded?.(b);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [beadId, workspace, onBeadLoaded]);

  useEffect(() => { load(); }, [load]);

  const metadataEntries = useMemo(() => {
    const m = bead?.metadata;
    if (!m || typeof m !== 'object') return [];
    return Object.entries(m as Record<string, unknown>);
  }, [bead?.metadata]);

  const hasEvents = (bead?.events?.length ?? 0) > 0;
  const hasMetadata = metadataEntries.length > 0;

  const TABS: Tab[] = useMemo(() => {
    const tabs: Tab[] = ['Overview', 'Deps'];
    if (hasMetadata) tabs.push('Metadata');
    if (hasEvents) tabs.push('Events');
    return tabs;
  }, [hasMetadata, hasEvents]);

  // If the active tab disappears (edit removed metadata, etc.), fall back.
  useEffect(() => {
    if (!TABS.includes(activeTab)) setActiveTab('Overview');
  }, [TABS, activeTab]);

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
    setEditLabels((bead.labels ?? []).join(', '));
    setEditExternalRef(bead.external_ref ?? '');
    setSaveError(null);
    setEditMode(true);
  }

  async function handleSave() {
    if (!bead) return;
    setSaveError(null);
    if (editStatus === 'closed' && bead.status !== 'closed') {
      const ok = window.confirm(
        `Close bead ${beadId}?\n\nThis will mark it closed (bd close). You can reopen later via the status dropdown.`,
      );
      if (!ok) return;
    }
    const patch: Parameters<typeof updateBead>[1] = {};
    if (editTitle !== bead.title) patch.title = editTitle;
    if (editDesc !== (bead.description ?? '')) patch.description = editDesc;
    if (editDesign !== (bead.design ?? '')) patch.design = editDesign;
    if (editNotes !== (bead.notes ?? '')) patch.notes = editNotes;
    if (editAcceptance !== (bead.acceptance_criteria ?? '')) patch.acceptance = editAcceptance;
    if (editStatus !== bead.status) patch.status = editStatus;
    if (editPriority !== '' && Number(editPriority) !== bead.priority) patch.priority = Number(editPriority);
    if (editAssignee !== (bead.assignee ?? '')) patch.assignee = editAssignee;
    if (editExternalRef !== (bead.external_ref ?? '')) patch.externalRef = editExternalRef;

    const newLabels = parseLabels(editLabels);
    const labelDiff = diffLabels(bead.labels ?? [], newLabels);
    if (labelDiff.add.length) patch.addLabels = labelDiff.add;
    if (labelDiff.remove.length) patch.removeLabels = labelDiff.remove;

    const prevBead = bead;
    const optimistic: Bead = {
      ...bead,
      title: editTitle || bead.title,
      description: editDesc || undefined,
      design: editDesign || undefined,
      notes: editNotes || undefined,
      acceptance_criteria: editAcceptance || undefined,
      status: editStatus || bead.status,
      priority: editPriority !== '' ? Number(editPriority) : bead.priority,
      assignee: editAssignee || undefined,
      external_ref: editExternalRef || undefined,
      labels: newLabels,
    };
    setBead(optimistic);
    setEditMode(false);

    try {
      await updateBead(beadId, patch, workspace);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
      const nodePatch: Partial<{ title: string; status: string; priority: number }> = {};
      if (patch.title !== undefined) nodePatch.title = patch.title;
      if (patch.status !== undefined) nodePatch.status = patch.status;
      if (patch.priority !== undefined) nodePatch.priority = patch.priority;
      if (Object.keys(nodePatch).length > 0) {
        if (onNodePatch) onNodePatch(beadId, nodePatch);
        // Broadcast for peek-decoupled views (graph canvas, etc.) that
        // mounted before the drawer and want to keep their own copy of
        // the bead in sync.
        window.dispatchEvent(new CustomEvent('bead-patched', { detail: { id: beadId, patch: nodePatch } }));
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
      await addDep(beadId, newDepId.trim(), newDepType, workspace);
      setNewDepId('');
      await load();
    } catch (e) {
      setDepError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveDep(targetId: string) {
    setDepError(null);
    try {
      await removeDep(beadId, targetId, workspace);
      await load();
    } catch (e) {
      setDepError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddComment() {
    if (!commentBody.trim()) return;
    setCommentError(null);
    try {
      await addComment(beadId, commentBody.trim(), workspace);
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
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Couldn't load bead {beadId}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fetchError}</div>
        </div>
        <button onClick={load} style={{ fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>Reload bead</button>
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
        {activeTab === 'Overview' && !editMode && (
          <button
            onClick={startEdit}
            style={{
              marginLeft: 'auto',
              marginRight: 8,
              fontSize: 11,
              padding: '3px 10px',
              border: '1px solid var(--rule)',
              borderRadius: 2,
              background: 'var(--bg)',
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        )}
        {activeTab === 'Overview' && editMode && (
          <div style={{ marginLeft: 'auto', marginRight: 8, display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setEditMode(false); setSaveError(null); }}
              title="Discard pending edits"
              style={{
                fontSize: 11,
                padding: '3px 10px',
                border: '1px solid var(--rule)',
                borderRadius: 2,
                background: 'var(--bg)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                border: '1px solid var(--accent)',
                borderRadius: 2,
                background: 'var(--accent)',
                color: 'var(--on-strong)',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
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
            <KVRow label="owner" value={bead.owner} />
            <KVRow label="labels" value={bead.labels?.join(', ')} />
            <KVRow label="external ref" value={bead.external_ref} />
            <KVRow label="created" value={formatDate(bead.created_at)} />
            <KVRow label="updated" value={formatDate(bead.updated_at)} />
            <KVRow label="started" value={formatDate(bead.started_at)} />
            <KVRow label="closed" value={formatDate(bead.closed_at)} />
            <KVRow label="due" value={formatDate(bead.due_at)} />
            <KVRow label="defer until" value={formatDate(bead.defer_until)} />
            <KVRow label="close reason" value={bead.close_reason} />
            {bead.description && <MarkdownSection title="description" body={bead.description} />}
            {bead.design && <MarkdownSection title="design" body={bead.design} />}
            {bead.acceptance_criteria && <MarkdownSection title="acceptance" body={bead.acceptance_criteria} />}
            {bead.notes && <MarkdownSection title="notes" body={bead.notes} />}
            <CommentsBlock
              comments={bead.comments ?? []}
              error={commentError}
              draft={commentBody}
              onDraftChange={setCommentBody}
              onSubmit={handleAddComment}
            />
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
                {STATUS_OPTIONS.map(s => (<option key={s} value={s}>{s}</option>))}
                {!STATUS_OPTIONS.includes(editStatus) && editStatus !== '' && (
                  <option value={editStatus}>{editStatus} (custom)</option>
                )}
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
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>labels (comma-separated)</span>
              <input
                value={editLabels}
                onChange={e => setEditLabels(e.target.value)}
                placeholder="label-a, label-b"
                style={{ fontSize: 12.5, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-mono)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>external ref</span>
              <input
                value={editExternalRef}
                onChange={e => setEditExternalRef(e.target.value)}
                placeholder="gh-1234 / jira-FOO-456"
                style={{ fontSize: 12.5, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 2, fontFamily: 'var(--font-mono)' }}
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
                  <button
                    onClick={() => openPeek(dep.id)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                  >
                    {dep.id}
                    {dep.title && <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{dep.title}</span>}
                  </button>
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
                  <button
                    onClick={() => openPeek(dep.id)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                  >
                    {dep.id}
                    {dep.title && <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{dep.title}</span>}
                  </button>
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


        {activeTab === 'Metadata' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10.5, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
              {metadataEntries.length} key{metadataEntries.length === 1 ? '' : 's'}
            </div>
            {metadataEntries.map(([k, v]) => {
              const friendly = METADATA_LABELS[k];
              return (
                <div
                  key={k}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    gap: 10,
                    padding: '4px 0',
                    borderBottom: '1px solid var(--rule-2)',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{k}</div>
                    {friendly && (
                      <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 1 }}>{friendly}</div>
                    )}
                  </div>
                  <MetadataValue value={v} />
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'Events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(bead.events ?? []).map(ev => (
              <div key={ev.id} style={{ borderBottom: '1px solid var(--rule-2)', paddingBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{ev.event_type}</span>
                  {ev.actor && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>{ev.actor}</span>}
                  {ev.created_at && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>{formatDate(ev.created_at)}</span>}
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

export { metadataLabel };
