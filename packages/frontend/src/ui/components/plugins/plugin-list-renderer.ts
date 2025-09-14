/* FILE: packages/frontend/src/ui/components/plugins/plugin-list-renderer.ts */
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { PluginManifest } from '#shared/index.js';
import { createCardElement, type ActionButtonConfig, type CardFooterConfig } from '#frontend/ui/utils/card-utils.js';
import { setIcon } from '#frontend/ui/helpers/index.js';

export class PluginListRenderer {
    #container: HTMLElement;
    #placeholder: HTMLElement;
    #uiControllerRef: UIController;
    #translate: UIController['translationService']['translate'];

    constructor(container: HTMLElement, placeholder: HTMLElement, uiControllerRef: UIController) {
        this.#container = container;
        this.#placeholder = placeholder;
        this.#uiControllerRef = uiControllerRef;
        this.#translate = this.#uiControllerRef.translationService.translate;
    }

    public render(manifests: PluginManifest[], pendingPlugins: Set<string>, editingPluginId: string | null): void {
        if (manifests.length === 0) {
            this.#placeholder.textContent = this.#translate('noPluginsInstalled');
            this.#container.innerHTML = '';
            this.#container.appendChild(this.#placeholder);
            return;
        }

        const sortedManifests = this.#getSortedManifests(manifests);
        const pluginComponents = this.#uiControllerRef.pluginUIService.getGlobalSettingsComponents();

        const cardElements = sortedManifests.map((manifest) => {
            const component = pluginComponents.get(manifest.id);
            const isEditingThisCard = editingPluginId === manifest.id;
            
            if (component) {
                const config = this.#uiControllerRef.appStore.getState().pluginGlobalConfigs.get(manifest.id) || null;
                component.update(config, this.#uiControllerRef.pluginUIService.getPluginUIContext(manifest.id), { isPending: pendingPlugins.has(manifest.id), isEditing: isEditingThisCard });
                return component.getElement();
            } else {
                // This case should be rare now that components are always created, but it's a safe fallback.
                return this.#createBasicPluginCard(manifest, pendingPlugins.has(manifest.id));
            }
        });
        
        this.#container.replaceChildren(...cardElements);
    }

    #getSortedManifests(manifests: PluginManifest[]): PluginManifest[] {
        return [...manifests].sort((a, b) => {
            const nameA = this.#translate(a.nameKey, { defaultValue: a.id });
            const nameB = this.#translate(b.nameKey, { defaultValue: b.id });
            return nameA.localeCompare(nameB);
        });
    }

    #createBasicPluginCard(manifest: PluginManifest, isPending: boolean): HTMLDivElement {
        const isEnabled = manifest.status === 'enabled';
        
        const actionButtons: ActionButtonConfig[] = [
            { action: 'toggle', titleKey: isEnabled ? 'disable' : 'enable', iconKey: isPending ? 'UI_HOURGLASS' : (isEnabled ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF'), pluginId: manifest.id, translate: this.#translate },
            { action: 'uninstall', titleKey: 'uninstall', iconKey: 'UI_DELETE', pluginId: manifest.id, extraClasses: ['btn-icon-danger'], translate: this.#translate }
        ];

        const description = this.#translate(manifest.descriptionKey || '', { defaultValue: '' });
        
        const detailsIcon = document.createElement('span'); setIcon(detailsIcon, 'UI_NOTES');
        detailsIcon.className = 'material-icons card-detail-icon';
        detailsIcon.title = this.#translate('descriptionOptionalLabel');
        const detailsHtml = `<div class="card-detail-line">${detailsIcon.outerHTML}<span class="card-detail-value allow-wrap">${description}</span></div>`;

        const footerConfig: CardFooterConfig = {
            mainText: `v${manifest.version} by ${manifest.author || 'Unknown'}`,
            statusIconKey: 'UI_INFO'
        };

        const itemClasses = "plugin-item"; // Not clickable by default
        const card = createCardElement({
            ...(manifest.icon ? { iconName: manifest.icon.name, iconType: manifest.icon.type } : { iconName: 'UI_EXTENSION' }),
            title: this.#translate(manifest.nameKey, { defaultValue: manifest.id }),
            itemClasses, actionButtons, detailsHtml, footerConfig,
            translate: this.#translate,
            datasetAttributes: { pluginId: manifest.id }
        });
        
        setIcon(card.querySelector('.card-detail-line:first-of-type .card-detail-icon'), 'UI_NOTES');
        
        if (manifest.status !== 'enabled') card.classList.add('config-item-disabled');
        if (isPending) card.classList.add('is-pending');
        return card;
    }
}