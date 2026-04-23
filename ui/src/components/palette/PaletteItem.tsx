import type { PaletteCommand } from './commands';

interface Props {
  item: PaletteCommand;
  active: boolean;
  docMode: boolean;
  onSelect: () => void;
  onHover: () => void;
}

export function PaletteItem({ item, active, docMode, onSelect, onHover }: Props) {
  return (
    <div
      className={`kbar-item${active ? ' active' : ''}`}
      onMouseEnter={onHover}
      onClick={onSelect}
      role="option"
      aria-selected={active}
    >
      <span className="icon">{item.icon}</span>
      <span className="kbar-item-text">
        <span className="title">{item.title}</span>
        <span className="desc">{item.description}</span>
      </span>
      {docMode && item.cli && (
        <span className="cli">{item.cli}</span>
      )}
      {item.kbd && <span className="kb">{item.kbd}</span>}
      {!docMode && item.action === 'copy-cli' && (
        <span className="kbar-item-action-hint">⌘↵ copy CLI</span>
      )}
    </div>
  );
}
