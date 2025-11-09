/* FILE: packages/frontend/src/components/header/LanguageSelector.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { Dropdown } from '#frontend/components/shared/Dropdown.js';
import type { LanguageCode } from '#shared/index.js';

const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; labelKey: string; icon?: string; }> = [
  { code: 'en', labelKey: 'langEnglish', icon: '🇬🇧' },
  { code: 'fr', labelKey: 'langFrench', icon: '🇫🇷' },
  { code: 'zh', labelKey: 'langChinese', icon: '🇨🇳' },
];

export function LanguageSelector() {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const languagePreference = useAppStore(state => state.languagePreference);
    const { actions } = context!.appStore.getState();
    
    if (!context) return null;

    const currentLangOption = LANGUAGE_OPTIONS.find(opt => opt.code === languagePreference) || LANGUAGE_OPTIONS[0];

    const trigger = (
        <button id="language-selector-trigger" className="btn header-dropdown-trigger btn-secondary" title={translate(currentLangOption.labelKey)}>
            <span className="lang-icon">{currentLangOption.icon}</span>
        </button>
    );

    return (
        <Dropdown id="language-selector" trigger={trigger}>
            {LANGUAGE_OPTIONS.map(opt => (
                <button
                    key={opt.code}
                    id={`language-selector-option-${opt.code}`}
                    onClick={() => actions.setLocalPreference('languagePreference', opt.code)}
                    className={`btn btn-secondary w-full justify-start ${languagePreference === opt.code ? 'active' : ''}`}
                >
                    <span className="lang-icon">{opt.icon}</span>
                    <span>{translate(opt.labelKey)}</span>
                </button>
            ))}
        </Dropdown>
    );
}