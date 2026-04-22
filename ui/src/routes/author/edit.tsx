import { useParams, Navigate, useNavigate, Link } from 'react-router-dom';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useSetDirty } from '../../hooks/useSetDirty';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useFormulaSource } from '../../hooks/useFormulaSource';
import { parseFormula } from '../../lib/formula-parse';
import { highlightLines } from '../../lib/formula-highlight';
import { layoutDAG } from '../../lib/dag-layout';
import { writeVarDefault } from '../../lib/formula-write';
import { DAG } from '../../components/editor/DAG';
import { SourcePane } from '../../components/editor/SourcePane';
import { VarsDrawer } from '../../components/editor/VarsDrawer';
import { CookView } from '../../components/editor/CookView';
import { InstancesView } from '../../components/editor/InstancesView';
import { SaveBanner } from '../../components/editor/SaveBanner';
import { ConflictBanner } from '../../components/editor/ConflictBanner';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import type { Destination } from '../../types';

const VALID_TABS = ['source', 'cook', 'instances'] as const;
type Tab = typeof VALID_TABS[number];

// Mayor decision Q8: formula dir is derived from the formulaName prefix up to the first "/",
// or defaults to "local" when no slash present.
// The URL encodes the full <dir>/<name> as formulaName param, URL-encoded.
// e.g. /author/edit/gastownhall-upstream/source → dir="local", name="gastownhall-upstream"
// e.g. /author/edit/foo~bar~gastownhall-upstream/source where "~" separates dir from name
// For v1: dir defaults to the active workspace name (bd-server resolves it to the configured dir).
function parseFormulaParam(formulaName: string): { dir: string; name: string } {
  // Convention: formulaName is the raw name; dir is the workspace name (passed separately)
  return { dir: 'local', name: formulaName };
}

export const handle = {
  destination: 'author' as Destination,
  breadcrumb: ['author', 'edit'],
};

export default function AuthorEdit() {
  const { formulaName = '', tab = 'source' } = useParams<{ formulaName: string; tab: string }>();
  const navigate = useNavigate();
  const { current: workspace } = useWorkspace();

  if (!VALID_TABS.includes(tab as Tab)) {
    return <Navigate to={`/author/edit/${formulaName}/source`} replace />;
  }

  const currentTab = tab as Tab;
  const { dir, name } = parseFormulaParam(formulaName);
  const wsName = workspace?.name ?? null;

  const {
    current, setCurrent, loading, loadError,
    saveState, saveError, dirty, save, reload, forceOverwrite,
  } = useFormulaSource(dir, name, wsName);

  const [selected, setSelected] = useState<string | null>(null);

  const parsed = useMemo(() => parseFormula(current), [current]);
  const highlighted = useMemo(() => highlightLines(current), [current]);
  const srcLines = useMemo(() => current.split('\n'), [current]);
  const layout = useMemo(() => layoutDAG(parsed.steps), [parsed.steps]);

  useSetFooter(`${formulaName} · ${currentTab}`, 'Author · Edit');
  useSetDirty(dirty);

  // Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  // Warn on navigation away when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const onVarChange = useCallback((varName: string, value: string) => {
    setCurrent(writeVarDefault(current, varName, value));
  }, [current, setCurrent]);

  const onTabChange = useCallback((newTab: Tab) => {
    navigate(`/author/edit/${formulaName}/${newTab}`, { replace: true });
  }, [formulaName, navigate]);

  // No workspace selected
  if (!workspace) {
    return (
      <div className="ed-no-workspace">
        <span>Select a workspace to edit formulas.</span>
      </div>
    );
  }

  // Formula not found
  if (!loading && loadError && loadError.includes('not found')) {
    return (
      <div className="ed-not-found">
        <h2>Formula not found</h2>
        <p>"{formulaName}" does not exist in workspace "{wsName}".</p>
        <Link to="/author/browse">← Browse formulas</Link>
      </div>
    );
  }

  const hasParseErrors = parsed.errors.length > 0;
  const extendsValue = parsed.header.extends ? String(parsed.header.extends) : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div className="ed-header">
        <span className="ed-crumb" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>
          beads · author
        </span>
        <span style={{ color: 'var(--mute-2)', fontSize: 11 }}>·</span>
        <span className="ed-formula-name">{parsed.header.formula || formulaName}</span>
        {parsed.header.version && (
          <span className="ed-version">v{String(parsed.header.version)}</span>
        )}
        {extendsValue && (
          <Link
            to={`/author/edit/${extendsValue}/source`}
            className="ed-extends-chip"
            title={`extends ${extendsValue}`}
          >
            extends {extendsValue}
          </Link>
        )}
        <div className="ed-spacer" />
        <SaveBanner state={saveState} error={saveError} dirty={dirty} onSave={save} />
      </div>

      {/* Loading / error state */}
      {loading && <div className="ed-loading">Loading formula…</div>}
      {!loading && loadError && !loadError.includes('not found') && (
        <LoadingFailedBanner kind="formula-source" formulaName={formulaName} onRetry={reload} />
      )}

      {/* Tabs */}
      {!loading && !loadError && (
        <>
          <div className="ed-tabs">
            <div
              className={`tab ${currentTab === 'source' ? 'active' : ''}`}
              onClick={() => onTabChange('source')}
            >
              Source <span className="ct">{parsed.steps.length} steps</span>
            </div>
            <div
              className={`tab ${currentTab === 'cook' ? 'active' : ''} ${hasParseErrors ? 'disabled' : ''}`}
              onClick={() => !hasParseErrors && onTabChange('cook')}
              title={hasParseErrors ? 'Fix parse errors before cooking' : undefined}
            >
              Cook <span className="ct">preview</span>
            </div>
            <div
              className={`tab ${currentTab === 'instances' ? 'active' : ''}`}
              onClick={() => onTabChange('instances')}
            >
              Instances
            </div>
          </div>

          {/* Tab bodies */}
          {currentTab === 'source' && (
            <div className="ed-body">
              {/* DAG pane — LEFT */}
              <div className="ed-dag-pane">
                <div className="ed-dag-head">
                  <span className="lbl">DAG</span>
                  <span className="meta">{parsed.steps.length} steps · {layout.edges.length} edges</span>
                  {hasParseErrors && (
                    <span className="meta err" style={{ marginLeft: 'auto' }}>
                      {parsed.errors.length} error{parsed.errors.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <DAG
                  steps={parsed.steps}
                  layout={layout}
                  selected={selected}
                  onSelect={setSelected}
                  errors={parsed.errors}
                />
              </div>

              {/* Source pane — MIDDLE */}
              <SourcePane
                src={current}
                setSrc={setCurrent}
                highlighted={highlighted}
                srcLines={srcLines}
                selected={selected}
                stepRanges={parsed.stepRanges}
                errors={parsed.errors}
                conflictBanner={saveState === 'conflict' ? (
                  <ConflictBanner onReload={reload} onForceOverwrite={forceOverwrite} />
                ) : undefined}
              />

              {/* Vars drawer — RIGHT */}
              <VarsDrawer vars={parsed.vars} onChange={onVarChange} />
            </div>
          )}

          {currentTab === 'cook' && (
            <CookView
              formulaName={formulaName}
              vars={parsed.vars}
              workspace={wsName!}
              hasParseErrors={hasParseErrors}
            />
          )}

          {currentTab === 'instances' && (
            <InstancesView formulaName={formulaName} workspace={wsName!} />
          )}
        </>
      )}
    </div>
  );
}
