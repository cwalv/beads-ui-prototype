import { useTheme } from '../../hooks/useTheme';
import type { ThemeChoice } from '../../hooks/useTheme';

const OPTIONS: { value: ThemeChoice; label: string; glyph: string }[] = [
  { value: 'auto',  label: 'Match system', glyph: '◐' },
  { value: 'light', label: 'Light',        glyph: '☀' },
  { value: 'dark',  label: 'Dark',         glyph: '☾' },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-switcher" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(o => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            className={`theme-opt${active ? ' active' : ''}`}
            onClick={() => setTheme(o.value)}
          >
            <span aria-hidden="true">{o.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
