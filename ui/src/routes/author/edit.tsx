import { useParams, Navigate, useNavigate, Link } from 'react-router-dom';
import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useSetDirty } from '../../hooks/useSetDirty';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useFormulaSource } from '../../hooks/useFormulaSource';
import { useFormulaSchema } from '../../hooks/useFormulaSchema';
import { parseFormula } from '../../lib/formula-parse';
import { validateAgainstSchema } from '../../lib/schema-validate';
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
import { PaneDivider } from '../../components/ui/PaneDivider';
import { FormView } from './form';
import type { Destination } from '../../types';

const VALID_TABS = ['source', 'form', 'cook', 'instances'] as const;
type Tab = typeof VALID_TABS[number];

const DEFAULT_SPLIT_PX = 560;
const MIN_SOURCE_PX = 320;
const MIN_DAG_PX = 200;
const VARS_PX = 340;
const DIVIDER_PX = 8;


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
  const wsName = workspace?.name ?? null;
  // bd-server's GET /v1/formulas/<dir>/<name> resolves dir against [formula_dirs]
  // in bd-server config. Convention: the workspace name doubles as the formula_dir name.
  const dir = wsName;
  const name = formulaName;

  const {
    current, setCurrent, loading, loadError,
    saveState, saveError, dirty, save, reload, forceOverwrite,
    editability, packSource,
  } = useFormulaSource(dir, name, wsName);

  const [selected, setSelected] = useState<string | null>(null);
  const [dagScrollTo, setDagScrollTo] = useState<{ id: string; n: number } | null>(null);

  const onDagSelect = useCallback((id: string) => {
    setSelected(id);
    setDagScrollTo(prev => ({ id, n: (prev?.n ?? 0) + 1 }));
  }, []);
  const [splitPx, setSplitPx] = useState(DEFAULT_SPLIT_PX);
  const [splitInitialized, setSplitInitialized] = useState(false);
  const [errorScrollTo, setErrorScrollTo] = useState<{ line: number; n: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const onSplitDrag = useCallback((clientX: number) => {
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const max = Math.max(MIN_SOURCE_PX, rect.width - VARS_PX - DIVIDER_PX - MIN_DAG_PX);
    setSplitPx(Math.max(MIN_SOURCE_PX, Math.min(max, clientX - rect.left)));
    setSplitInitialized(true);
  }, []);

  const { schema, error: schemaError } = useFormulaSchema();
  const parsedRaw = useMemo(() => parseFormula(current), [current]);
  const parsed = useMemo(() => {
    if (!schema) return parsedRaw;
    const schemaErrs = validateAgainstSchema(parsedRaw, schema);
    return schemaErrs.length === 0 ? parsedRaw : { ...parsedRaw, errors: [...parsedRaw.errors, ...schemaErrs] };
  }, [parsedRaw, schema]);
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

  const onErrorBadgeClick = useCallback(() => {
    const firstErr = parsed.errors.find(e => e.line !== undefined);
    if (firstErr?.line !== undefined) {
      setErrorScrollTo(prev => ({ line: firstErr.line!, n: (prev?.n ?? 0) + 1 }));
    }
  }, [parsed.errors]);

  // Initialize the source/DAG split to ~50/50 of the available space (after
  // the fixed-width vars drawer and divider) on first render. Only runs once
  // per session; user drags afterward stick.
  useLayoutEffect(() => {
    if (splitInitialized || loading || currentTab !== 'source') return;
    const body = bodyRef.current;
    if (!body) return;
    const half = (body.getBoundingClientRect().width - VARS_PX - DIVIDER_PX) / 2;
    if (half > MIN_SOURCE_PX) {
      setSplitPx(Math.round(half));
      setSplitInitialized(true);
    }
  }, [splitInitialized, loading, currentTab]);

  const onTabChange = useCallback((newTab: Tab) => {
    navigate(`/author/edit/${formulaName}/${newTab}`, { replace: true });
  }, [formulaName, navigate]);

  // Called from FormView step rows — jump to source pane at the step's line
  const onJumpToSource = useCallback((stepId: string | null, line?: number) => {
    if (stepId) setSelected(stepId);
    if (line !== undefined) setErrorScrollTo(prev => ({ line, n: (prev?.n ?? 0) + 1 }));
    onTabChange('source');
  }, [onTabChange, setSelected, setErrorScrollTo]);

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
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
        <SaveBanner
          state={saveState}
          error={saveError}
          dirty={dirty}
          onSave={save}
          packReadOnly={editability === 'pack-read-only'}
          packSource={packSource}
        />
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
              className={`tab ${currentTab === 'form' ? 'active' : ''}`}
              onClick={() => onTabChange('form')}
            >
              Form <span className="ct">structured</span>
            </div>
            <div
              className={`tab ${currentTab === 'cook' ? 'active' : ''} ${hasParseErrors ? 'disabled' : ''}`}
              onClick={() => !hasParseErrors && onTabChange('cook')}
              title={hasParseErrors ? 'Fix parse errors before cooking' : undefined}
            >
              Cook <span className="ct">{hasParseErrors ? 'fix parse errors first' : 'preview'}</span>
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
            <div className="ed-body" ref={bodyRef}>
              {/* Source pane — LEFT (resizable via divider) */}
              <SourcePane
                widthPx={splitPx}
                src={current}
                setSrc={setCurrent}
                highlighted={highlighted}
                srcLines={srcLines}
                selected={selected}
                stepRanges={parsed.stepRanges}
                errors={parsed.errors}
                scrollTo={errorScrollTo}
                dagScrollTo={dagScrollTo}
                conflictBanner={saveState === 'conflict' ? (
                  <ConflictBanner onReload={reload} onForceOverwrite={forceOverwrite} />
                ) : undefined}
              />

              <PaneDivider onDrag={onSplitDrag} />

              {/* DAG pane — middle (fills remaining; canvas scrolls/pans internally) */}
              <div className="ed-dag-pane">
                <div className="ed-dag-head">
                  <span className="lbl">DAG</span>
                  <span className="meta">{parsed.steps.length} steps · {layout.edges.length} edges</span>
                  {hasParseErrors && (
                    <span
                      className="meta err ed-err-badge"
                      style={{ marginLeft: 'auto' }}
                      onClick={onErrorBadgeClick}
                      role="button"
                      tabIndex={0}
                      title="Jump to first parse error in the source"
                    >
                      {parsed.errors.length} error{parsed.errors.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <DAG
                  formulaName={formulaName}
                  steps={parsed.steps}
                  layout={layout}
                  selected={selected}
                  onSelect={onDagSelect}
                  errors={parsed.errors}
                />
              </div>

              {/* Vars drawer — RIGHT (fixed width) */}
              <VarsDrawer vars={parsed.vars} onChange={onVarChange} />
            </div>
          )}

          {currentTab === 'form' && (
            <FormView
              src={current}
              setSrc={setCurrent}
              parsed={parsed}
              schema={schema}
              schemaError={schemaError}
              formulaName={formulaName}
              onJumpToSource={onJumpToSource}
            />
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
