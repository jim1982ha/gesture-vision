/* FILE: packages/frontend/src/ui/utils/card-utils.ts */
// Utility for creating card UI elements using a declarative template.
import { createFromTemplate } from "./template-renderer.js";
import { setIcon } from '#frontend/ui/helpers/index.js';
import { translate } from '#shared/services/translations.js';
import { clsx } from '../helpers/ui-dom-helpers.js';

export interface CardFooterConfig {
    mainText?: string;
    pillsHtml?: string;
    statusIconKey?: string;
    statusClass?: string;
    statusText?: string;
}

export interface CardContent {
  iconName: string; 
  iconType?: 'material-icons' | 'mdi';
  title: string;
  actionButtonsHtml?: string;
  detailsHtml?: string;
  footerConfig?: CardFooterConfig;
  itemClasses?: string; 
  datasetAttributes?: Record<string, string>;
  titleAttribute?: string; 
  ariaLabel?: string;    
}

interface ActionButtonConfig {
    action: string;
    title?: string;
    titleKey?: string;
    iconKey: string;
    extraClasses?: string[];
    pluginId?: string;
    text?: string;
    textKey?: string;
}

/**
 * Creates a standardized icon button element for use in card actions.
 * @param config - The configuration for the button.
 * @returns The generated HTMLButtonElement.
 */
export function createCardActionButton(config: ActionButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';

    const hasText = !!(config.text || config.textKey);
    const finalClasses = clsx(
        "btn",
        !hasText && "btn-icon", // Only add btn-icon if there is no text
        ...(config.extraClasses || [])
    );
    button.className = finalClasses;

    if (config.pluginId) button.dataset.pluginId = config.pluginId;
    button.dataset.action = config.action;
    
    const title = config.title || (config.titleKey ? translate(config.titleKey) : '');
    button.title = title;
    button.setAttribute('aria-label', title);
    
    let innerHTML = `<span class="btn-icon-span"></span>`;
    if (hasText) {
        const textContent = config.text || (config.textKey ? translate(config.textKey) : '');
        innerHTML += `<span class="btn-text-span">${textContent}</span>`;
    }
    button.innerHTML = innerHTML;

    const iconSpan = button.querySelector('.btn-icon-span');
    if (iconSpan) setIcon(iconSpan, config.iconKey);
    
    return button;
}

function buildFooterHtml(config?: CardFooterConfig): string {
    if (!config) return '';

    const mainTextParts: string[] = [];

    if (config.statusIconKey) {
        const statusIconEl = document.createElement('span');
        statusIconEl.className = `card-detail-icon history-status-icon status-${config.statusClass || 'info'}`;
        setIcon(statusIconEl, config.statusIconKey);
        mainTextParts.push(statusIconEl.outerHTML);
    }

    if (config.mainText) {
      mainTextParts.push(`<span class="truncate">${config.mainText}</span>`);
    }
    
    if (config.statusText) {
      mainTextParts.push(`<span class="card-footer-separator">|</span><span class="footer-status-text ${config.statusClass || ''}-text">${config.statusText}</span>`);
    }
    
    const mainContentHtml = `<div class="flex items-center gap-1 min-w-0">${mainTextParts.join('')}</div>`;
    
    const pillsHtml = config.pillsHtml ? `<div class="footer-pills-wrapper flex items-center gap-1">${config.pillsHtml}</div>` : '';
    
    return `${mainContentHtml}${pillsHtml}`;
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
            <div class="flex items-center gap-3 w-full">
              <span class="{iconClasses} card-icon">{iconContent}</span>
              <span class="card-title">{title}</span>
              <div class="card-item-actions" data-if="hasActionButtons" data-html-key="actionButtonsHtml"></div>
            </div>
        </div>
        <div class="card-details" data-if="hasDetails" data-html-key="detailsHtml"></div>
        <div class="card-footer" data-if="hasFooter" data-html-key="footerHtml"></div>
      </div>
    `;

    const isMdi = content.iconType === 'mdi' || content.iconName.startsWith('mdi-');
    const data = {
        itemClasses: content.itemClasses || '',
        titleAttribute: content.titleAttribute || '',
        ariaLabel: content.ariaLabel || '',
        iconClasses: isMdi ? `mdi ${content.iconName}` : 'material-icons',
        iconContent: isMdi ? '' : content.iconName,
        title: content.title,
        hasActionButtons: !!content.actionButtonsHtml,
        actionButtonsHtml: content.actionButtonsHtml || '',
        hasDetails: !!content.detailsHtml,
        detailsHtml: content.detailsHtml || '',
        hasFooter: !!content.footerConfig,
        footerHtml: buildFooterHtml(content.footerConfig)
    };
    
    const element = createFromTemplate(template, data);

    if (element && content.datasetAttributes) {
        Object.entries(content.datasetAttributes).forEach(([key, value]) => {
            element.dataset[key] = value;
        });
    }

    return element as HTMLDivElement;
}