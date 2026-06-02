/* FILE: packages/frontend/src/components/shared/ButtonGroup.tsx */
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import type { GestureCategoryIconType } from '#shared/index.js';

export interface ButtonGroupOption {
    value: string | number | boolean;
    title: string;
    text: string;
    iconKey: GestureCategoryIconType | string;
}

interface ButtonGroupProps {
    options: ButtonGroupOption[];
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
    className?: string;
    id: string;
}

export const ButtonGroup = ({ options, value, onChange, disabled = false, className = '', id }: ButtonGroupProps) => (
    <div id={id} className={`button-toggle-group ${className}`} role="radiogroup">
        {options.map(opt => (
            <button
                id={`${id}-button-${String(opt.value)}`}
                key={String(opt.value)}
                className={`btn btn-secondary ${value === opt.value ? 'active' : ''}`}
                onClick={() => onChange(opt.value)}
                disabled={disabled}
                title={opt.title}
            >
                <span ref={el => el && setIcon(el, opt.iconKey)}></span>
                <span className="toggle-button-text">{opt.text}</span>
            </button>
        ))}
    </div>
);