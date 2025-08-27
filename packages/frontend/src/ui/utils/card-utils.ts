/* FILE: packages/frontend/src/ui/utils/card-utils.ts */
// Utility for creating card UI elements using a declarative template.
import { createFromTemplate } from "./template-renderer.js";

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