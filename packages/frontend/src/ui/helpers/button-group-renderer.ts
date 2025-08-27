/* FILE: packages/frontend/src/ui/helpers/button-group-renderer.ts */
import { translate } from "#shared/services/translations.js";
import { createFromTemplate } from "#frontend/ui/utils/template-renderer.js";
import { setIcon } from "#frontend/ui/helpers/icon-helpers.js";
import type { ButtonGroupOption } from "#frontend/ui/base-settings-tab.js";

/**
 * Renders a group of toggle buttons inside a specified container element.
 * @param container The HTMLElement to render the buttons into.
 * @param options An array of configuration objects for each button.
 */
export function renderButtonGroup(
  container: HTMLElement | null | undefined,
  options: Readonly<Array<ButtonGroupOption>>
): void {
  if (!container) return;
  container.innerHTML = "";
  const template = `<button type="button" class="btn btn-secondary" role="radio" data-value="{value}" title="{title}"><span class="material-icons" data-if="hasIcon"></span><span class="toggle-button-text" data-if="hasText">{text}</span></button>`;

  options.forEach((opt) => {
    const textToDisplay = opt.textKey ? translate(opt.textKey) : opt.text;
    const title = opt.titleKey
      ? translate(opt.titleKey, { defaultValue: textToDisplay || opt.value })
      : textToDisplay || opt.value;
    const el = createFromTemplate(template, {
      value: opt.value,
      title: title,
      hasIcon: !!opt.iconKey,
      hasText: !!textToDisplay,
      text: textToDisplay,
    });
    if (el && opt.iconKey)
      setIcon(el.querySelector(".material-icons"), opt.iconKey);
    if (el) container.appendChild(el);
  });
}