/* FILE: packages/shared/types/plugin.types.ts */

export interface ActionConfig {
    pluginId: string;
    settings?: unknown;
}

export interface PluginManifest {
    id: string;
    nameKey: string;
    version: string;
    descriptionKey?: string;
    author?: string;
    icon?: { type: 'material-icons' | 'mdi'; name: string };
    capabilities: {
      hasGlobalSettings?: boolean;
      providesActions?: boolean;
      providesTab?: boolean;
      providesUIContribution?: boolean;
    };
    globalConfigFileName?: string;
    defaultGlobalConfigPath?: string;
    backendEntry?: string;
    frontendEntry?: string;
    frontendStyle?: string;
    locales?: Record<string, Record<string, string>>;
    status?: 'enabled' | 'disabled';
    sourceUrl?: string;
}

export interface ActionSettingFieldOption {
    value: string;
    label: string;
    disabled?: boolean;
}
  
export interface ActionSettingFieldDescriptor {
    id: string;
    type: 'text' | 'password' | 'url' | 'select' | 'textarea' | 'checkbox';
    labelKey: string;
    placeholderKey?: string;
    helpTextKey?: string;
    required?: boolean;
    rows?: number;
    optionsSource?: (context: unknown, currentSettings?: Record<string, unknown>, filterText?: string) => Promise<ActionSettingFieldOption[]>;
    searchable?: boolean;
    dependsOn?: string[];
    autocomplete?: 'on' | 'off' | 'name' | 'email' | 'username' | 'new-password' | 'current-password' | 'url';
}

export interface ActionDisplayDetail {
    icon?: string;
    iconType?: 'material-icons' | 'mdi';
    value: string;
    allowWrap?: boolean;
}