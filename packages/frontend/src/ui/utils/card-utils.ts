/* FILE: packages/frontend/src/ui/utils/card-utils.ts */
// Utility for creating card UI elements using a declarative template.
import { createFromTemplate } from "./template-renderer.js";
import { setIcon } from '#frontend/ui/helpers/index.js';
import { translate } from '#shared/services/translations.js';

export interface CardContent {
  iconName: string; 
  iconType?: 'material-icons' | 'mdi';
  title: string;
  actionButtonsHtml?: string;
  detailsHtml?: string;
  footerHtml?: string;
  itemClasses?: string; 
  datasetAttributes?: Record<string, string>;
  titleAttribute?: string; 
  ariaLabel?: string;    
}

interface ActionButtonConfig {
    action: string;
    titleKey: string;
    iconKey: string;
    extraClasses?: string[];
    pluginId?: string;
}

/**
 * Creates a standardized icon button element for use in card actions.
 * @param config - The configuration for the button.
 * @returns The generated HTMLButtonElement.
 */
export function createCardActionButton(config: ActionButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-icon ${config.extraClasses?.join(' ') || ''}`;
    if (config.pluginId) button.dataset.pluginId = config.pluginId;
    button.dataset.action = config.action;
    button.title = translate(config.titleKey);
    button.setAttribute('aria-label', translate(config.titleKey));
    button.innerHTML = `<span></span>`; // Ensure inner span for the icon
    setIcon(button, config.iconKey);
    return button;
}

export function createCardElement(content: CardContent): HTMLDivElement {
    const template = `
      <div 
        class="card-item {itemClasses}" 
        title="{titleAttribute}" 
        aria-label="{ariaLabel}"
        data-attributes-placeholder
      >
        <div class="card-header">
          <div class="card-header-info">
            <div class="card-title-actions-wrapper">
              <span class="{iconClasses}">{iconContent}</span>
              <span class="card-title">{title}</span>
              <div class="card-item-actions" data-if="hasActionButtons" data-html-key="actionButtonsHtml"></div>
            </div>
          </div>
        </div>
        <div class="card-details" data-if="hasDetails" data-html-key="detailsHtml"></div>
        <div data-if="hasFooter" data-html-key="footerHtml"></div>
      </div>
    `;

    const isMdi = content.iconType === 'mdi' || content.iconName.startsWith('mdi-');
    const data = {
        ...content,
        itemClasses: content.itemClasses || '',
        titleAttribute: content.titleAttribute || '',
        ariaLabel: content.ariaLabel || '',
        iconClasses: `card-icon ${isMdi ? `mdi ${content.iconName}` : 'material-icons'}`,
        iconContent: isMdi ? '' : content.iconName,
        hasActionButtons: !!content.actionButtonsHtml,
        hasDetails: !!content.detailsHtml,
        hasFooter: !!content.footerHtml
    };
    
    const element = createFromTemplate(template, data);

    if (element && content.datasetAttributes) {
        Object.entries(content.datasetAttributes).forEach(([key, value]) => {
            element.dataset[key] = value;
        });
    }

    return element as HTMLDivElement;
}