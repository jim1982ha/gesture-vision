/* FILE: packages/frontend/src/ui/components/plugins/plugin-install-manager.ts */
import { UI_EVENTS, pubsub } from '#shared/index.js';
import { createButton } from '#frontend/ui/utils/card-utils.js';
import type { UIController } from '#frontend/ui/ui-controller-core.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

export class PluginInstallManager {
    #container: HTMLElement;
    #uiControllerRef: UIController;
    #translate: TranslationService['translate'];
    #isInstalling = false;

    #urlInput: HTMLInputElement | null = null;
    #installButton: HTMLButtonElement | null = null;

    constructor(container: HTMLElement, uiControllerRef: UIController) {
        this.#container = container;
        this.#uiControllerRef = uiControllerRef;
        this.#translate = this.#uiControllerRef.translationService.translate;
        this.render();
        this.attachEventListeners();
    }

    private render(): void {
        this.#container.innerHTML = `
            <div class="form-group">
                <label for="pluginInstallUrl" class="form-label">${this.#translate('pluginInstallUrlLabel')}</label>
                <div class="flex items-center gap-2">
                    <input type="url" id="pluginInstallUrl" class="form-control" autocomplete="off" placeholder="${this.#translate('pluginInstallUrlPlaceholder')}" />
                </div>
            </div>
        `;
        this.#urlInput = this.#container.querySelector('#pluginInstallUrl');
        this.#installButton = createButton({
            id: 'pluginInstallBtn',
            textKey: 'pluginInstallBtnText',
            iconKey: 'UI_UPLOAD',
            extraClasses: ['btn-primary', 'flex-shrink-0'],
            translate: this.#translate
        });
        this.#container.querySelector('.flex')?.appendChild(this.#installButton);
    }
    
    private attachEventListeners(): void {
        this.#installButton?.addEventListener('click', this.#handleInstallClick);
    }
    
    #handleInstallClick = async (): Promise<void> => {
        const url = this.#urlInput?.value.trim();
        if (!url || this.#isInstalling) return;

        this.#isInstalling = true;
        this.#updateButtonState();

        try {
            const response = await fetch('/api/plugins/manage/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const result = await response.json() as { success: boolean; message: string; };

            if (result.success) {
                pubsub.publish(UI_EVENTS.SHOW_NOTIFICATION, { message: result.message, type: 'success' });
                if (this.#urlInput) this.#urlInput.value = '';
            } else {
                pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: result.message });
            }
        } catch (error) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { message: `Install failed: ${(error as Error).message}` });
        } finally {
            this.#isInstalling = false;
            this.#updateButtonState();
        }
    };

    #updateButtonState(): void {
        if (!this.#installButton) return;
        this.#installButton.disabled = this.#isInstalling;
        this.#uiControllerRef.pluginUIService.getPluginUIContext().uiComponents.setIcon(this.#installButton, this.#isInstalling ? 'UI_HOURGLASS' : 'UI_UPLOAD');
    }

    public applyTranslations(): void {
        const translate = this.#translate;
        const label = this.#container.querySelector('label');
        if (label) label.textContent = translate('pluginInstallUrlLabel');
        if (this.#urlInput) this.#urlInput.placeholder = translate('pluginInstallUrlPlaceholder');
        
        const btnText = this.#installButton?.querySelector('.btn-text-span');
        if (btnText) btnText.textContent = translate('pluginInstallBtnText');
    }
}