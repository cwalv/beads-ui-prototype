import { useRef } from 'react';
import type { Step } from '../../../lib/formula-parse';
import { ChipList } from './ChipList';

const ON_EXHAUSTED_OPTS = ['hard_fail', 'soft_fail', 'skip', 'continue'] as const;

interface Props {
  step: Step;
  index: number;
  description: string;
  expanded: boolean;
  allStepIds: string[];
  onToggle: () => void;
  onFieldChange: (field: string, value: unknown) => void;
  onDelete: () => void;
  onJumpToSource?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragOver: boolean;
}

export function StepCard({
  step, index, description, expanded, allStepIds,
  onToggle, onFieldChange, onDelete, onJumpToSource,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: Props) {
  const idRef = useRef<HTMLInputElement>(null);

  const availableNeeds = allStepIds.filter(id => id !== step.id);

  return (
    <div
      className={`sc-card${expanded ? ' sc-card--open' : ''}${isDragOver ? ' sc-card--dragover' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="sc-header">
        <span
          className="sc-drag"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-label="Drag handle"
        >⠿</span>
        <span className="sc-num">{index + 1}</span>
        <button className="sc-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="sc-id">{step.id ?? '(no id)'}</span>
          {step.title && <span className="sc-title">{step.title}</span>}
          <span className="sc-chevron">{expanded ? '▲' : '▼'}</span>
        </button>
        {onJumpToSource && (
          <button
            className="sc-src"
            onClick={onJumpToSource}
            title="Jump to source"
            aria-label="Jump to source"
          >→ src</button>
        )}
        <button
          className="sc-delete"
          onClick={onDelete}
          title={`Delete step ${step.id ?? index + 1}`}
          aria-label="Delete step"
        >×</button>
      </div>

      {expanded && (
        <div className="sc-body">
          <StepRow label="id">
            <input
              ref={idRef}
              type="text"
              className="fm-input"
              defaultValue={step.id ?? ''}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== step.id) onFieldChange('id', v);
              }}
              onKeyDown={e => { if (e.key === 'Enter') idRef.current?.blur(); }}
            />
          </StepRow>

          <StepRow label="title">
            <input
              type="text"
              className="fm-input"
              defaultValue={step.title ?? ''}
              onBlur={e => onFieldChange('title', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </StepRow>

          <StepRow label="description">
            <textarea
              className="fm-textarea"
              rows={4}
              defaultValue={description}
              onBlur={e => onFieldChange('description', e.target.value)}
            />
          </StepRow>

          <StepRow label="needs">
            <ChipList
              values={step.needs}
              onChange={v => onFieldChange('needs', v)}
              placeholder="step id"
              suggestions={availableNeeds}
            />
          </StepRow>

          <StepRow label="max_attempts">
            <input
              type="number"
              className="fm-input"
              style={{ width: 80 }}
              defaultValue={step.retry?.max_attempts ?? ''}
              min={1}
              onBlur={e => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n > 0) onFieldChange('max_attempts', n);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </StepRow>

          <StepRow label="on_exhausted">
            <select
              className="fm-select"
              value={step.retry?.on_exhausted ?? ''}
              onChange={e => { if (e.target.value) onFieldChange('on_exhausted', e.target.value); }}
            >
              <option value="">— unset —</option>
              {ON_EXHAUSTED_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </StepRow>

          {Object.keys(step.metadata).length > 0 && (
            <StepRow label="metadata">
              <div className="sc-meta-rows">
                {Object.entries(step.metadata).map(([k, v]) => (
                  <div key={k} className="sc-meta-row">
                    <span className="sc-meta-key">{k}</span>
                    <input
                      type="text"
                      className="fm-input fm-input-sm"
                      defaultValue={String(v)}
                      onBlur={e => {
                        const updated = { ...step.metadata, [k]: e.target.value };
                        onFieldChange('metadata', updated);
                      }}
                    />
                  </div>
                ))}
              </div>
            </StepRow>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fm-row">
      <label className="fm-label">{label}</label>
      <div className="fm-field">{children}</div>
    </div>
  );
}
