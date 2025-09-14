/* FILE: packages/frontend/src/ui/helpers/card-utils.ts */
// Utility for creating card UI elements using a declarative template.
import { setIcon, clsx } from '#frontend/ui/helpers/index.js';
import type { Substitutions } from '#shared/services/translations.js';

type TranslateFn = (key: string, substitutions?: Substitutions) => string;

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
  translate: TranslateFn;
  id?: string;
  actionButtons?: ActionButtonConfig[];
  detailsHtml?: string;
  footerConfig?: CardFooterConfig;
  itemClasses?: string; 
  datasetAttributes?: Record<string, string>;
  titleAttribute?: string; 
}

export interface ButtonConfig {
    id?: string;
    action?: string;
    value?: string;
    title?: string;
    titleKey?: string;
    titleSubstitutions?: Substitutions;
    iconKey?: string;
    extraClasses?: string[];
    pluginId?: string;
    text?: string;
    textKey?: string;
    translate: TranslateFn;
}

export type ActionButtonConfig = Omit<ButtonConfig, 'id' | 'value'>;

export function createButton(config: ButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    const translate = config.translate;

    if (config.id) button.id = config.id;
    if (config.action) button.dataset.action = config.action;
    if (config.pluginId) button.dataset.pluginId = config.pluginId;
    if (config.value) button.dataset.value = config.value;

    const hasText = !!(config.text || config.textKey);
    const finalClasses = clsx("btn", !hasText && "btn-icon", ...(config.extraClasses || []));
    button.className = finalClasses;

    const titleSubstitutions = { ...(config.titleSubstitutions || {}) };
    const title = config.title || (config.titleKey ? translate(config.titleKey, titleSubstitutions) : '');
    button.title = title;
    button.setAttribute('aria-label', title);
    
    let innerHTML = `<span class="btn-icon-span"></span>`;
    if (hasText) {
        const textContent = config.text || (config.textKey ? translate(config.textKey) : '');
        innerHTML += `<span class="btn-text-span">${textContent}</span>`;
    }
    button.innerHTML = innerHTML;

    const iconSpan = button.querySelector('.btn-icon-span');
    if (iconSpan && config.iconKey) setIcon(iconSpan, config.iconKey);
    
    return button;
}

export function createCardActionButton(config: ActionButtonConfig): HTMLButtonElement {
    return createButton(config);
}

export function buildFooterHtml(config?: CardFooterConfig): string {
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
    const cardElement = document.createElement('div');
    cardElement.className = clsx('card-item', content.itemClasses);
    if (content.id) cardElement.id = content.id;
    if (content.titleAttribute) {
        cardElement.title = content.titleAttribute;
        cardElement.setAttribute('aria-label', content.titleAttribute);
    }
    if (content.datasetAttributes) {
        Object.entries(content.datasetAttributes).forEach(([key, value]) => {
            cardElement.dataset[key] = value;
        });
    }

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'card-header';
    const headerContentWrapper = document.createElement('div');
    headerContentWrapper.className = 'flex items-center gap-3 w-full';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'card-icon';
    setIcon(iconSpan, content.iconName);
    if (content.iconType === 'mdi') iconSpan.classList.add('mdi', content.iconName);
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title';
    titleSpan.textContent = content.title;
    
    headerContentWrapper.append(iconSpan, titleSpan);

    if (content.actionButtons && content.actionButtons.length > 0) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'card-item-actions';
        content.actionButtons.forEach(buttonConfig => {
            const button = createCardActionButton({...buttonConfig, translate: content.translate});
            actionsContainer.appendChild(button);
        });
        headerContentWrapper.appendChild(actionsContainer);
    }
    header.appendChild(headerContentWrapper);
    cardElement.appendChild(header);
    
    // --- Details ---
    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'card-details';
    if (content.detailsHtml) {
        detailsContainer.innerHTML = content.detailsHtml;
    }
    cardElement.appendChild(detailsContainer);

    // --- Footer ---
    if (content.footerConfig) {
        const footer = document.createElement('div');
        footer.className = 'card-footer';
        footer.innerHTML = buildFooterHtml(content.footerConfig);
        cardElement.appendChild(footer);
    }
    
    return cardElement;
}