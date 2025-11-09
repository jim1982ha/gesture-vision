/* FILE: packages/frontend/src/components/settings/AppearanceTab.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import { AVAILABLE_THEMES } from '#frontend/ui/ui-themes.js';
import { ButtonGroup, type ButtonGroupOption } from '#frontend/components/shared/ButtonGroup.js';
import type { ThemePreference } from '#frontend/types/index.js';

export function AppearanceTab() {
    const context = useContext(AppContext);
    const { themePreference } = useAppStore(state => ({ themePreference: state.themePreference }));
    
    if (!context) return null;
    
    const { translate } = context.services.translationService;
    const { actions } = context.appStore.getState();

    const COLOR_MODE_OPTIONS: ButtonGroupOption[] = [
        { value: 'light', iconKey: 'UI_LIGHT_MODE', titleKey: 'colorModeLight', textKey: 'colorModeLight' },
        { value: 'system', iconKey: 'UI_SYSTEM_MODE', titleKey: 'colorModeSystemLabel', textKey: 'colorModeSystemLabel' },
        { value: 'dark', iconKey: 'UI_DARK_MODE', titleKey: 'colorModeDark', textKey: 'colorModeDark' },
    ].map(opt => ({...opt, text: translate(opt.textKey), title: translate(opt.titleKey)}));

    const THEME_OPTIONS: ButtonGroupOption[] = AVAILABLE_THEMES.map(theme => ({
        value: theme.id,
        text: translate(theme.nameKey, {defaultValue: theme.id}),
        title: translate(theme.nameKey, {defaultValue: theme.id}),
        iconKey: theme.icon
    }));

    const handleModeChange = (mode: unknown) => {
        actions.setLocalPreference('themePreference', { base: themePreference.base, mode: mode as ThemePreference['mode'] });
    };

    const handleBaseThemeChange = (base: unknown) => {
        actions.setLocalPreference('themePreference', { base: base as string, mode: themePreference.mode });
    };

    return (
        <div id="settings-appearance-tab">
            <div id="appearance-tab-theme-section" className="form-section">
                <label id="appearance-tab-theme-label" className="form-label">{translate("themeSelectionLabel")}</label>
                <ButtonGroup
                    id="appearance-tab-theme-group"
                    className="flex-wrap"
                    options={THEME_OPTIONS}
                    value={themePreference.base}
                    onChange={handleBaseThemeChange}
                />
            </div>
            <div id="appearance-tab-colormode-section" className="form-section">
                <div id="appearance-tab-colormode-label" className="form-label">{translate("colorModeLegend")}</div>
                <ButtonGroup
                    id="appearance-tab-colormode-group"
                    options={COLOR_MODE_OPTIONS}
                    value={themePreference.mode}
                    onChange={handleModeChange}
                />
            </div>
        </div>
    );
}