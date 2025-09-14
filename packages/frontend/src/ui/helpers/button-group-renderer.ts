/* FILE: packages/frontend/src/ui/helpers/button-group-renderer.ts */
import type { ButtonGroupOption } from "#frontend/ui/base-settings-tab.js";
import { createButton } from "#frontend/ui/utils/card-utils.js";
import type { TranslationService } from '#frontend/services/translation.service.js';

/**
 * Renders a group of toggle buttons inside a specified container element.
 * @param container The HTMLElement to render the buttons into.
 * @param options An array of configuration objects for each button.
 * @param translationService The service instance for translations.
 */
export function renderButtonGroup(
  container: HTMLElement | null | undefined,
  options: Readonly<Array<ButtonGroupOption>>,
  translationService: TranslationService
): void {
  if (!container) return;
  container.innerHTML = "";
  options.forEach((opt) => {
    const button = createButton({
        action: 'toggle',
        value: opt.value,
        titleKey: opt.titleKey,
        iconKey: opt.iconKey,
        textKey: opt.textKey,
        text: opt.text,
        extraClasses: ['btn-secondary'],
        translate: translationService.translate,
    });
    button.setAttribute('role', 'radio');
    container.appendChild(button);
  });
}