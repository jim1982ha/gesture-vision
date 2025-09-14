/* FILE: packages/frontend/src/ui/components/rtsp/rtsp-source-card.ts */
import { createCardElement, type ActionButtonConfig } from '#frontend/ui/helpers/card-utils.js';
import { setIcon } from '#frontend/ui/helpers/index.js';
import type { RtspSourceConfig } from '#shared/index.js';
import type { TranslationService } from '#frontend/services/translation.service.js';

function maskRtspUrlPassword(url: string): string {
    return url ? url.replace(/(rtsp:\/\/(?:[^:@/]+:)?)([^:@/]+)(@)/, "$1********$3") : "";
}

export function createRtspSourceCard(
    source: RtspSourceConfig,
    index: number,
    isEditing: boolean,
    translate: TranslationService['translate']
): HTMLDivElement {
    const onDemandText = source.sourceOnDemand ? ` (${translate("rtspOnDemandIndicator")})` : "";
    const roi = source.roi;
    const hasCustomRoi = roi && (roi.x !== 0 || roi.y !== 0 || roi.width !== 100 || roi.height !== 100);
    
    const urlIcon = document.createElement('span'); setIcon(urlIcon, 'UI_LINK');
    let detailsHtml = `<div class="card-detail-line">${urlIcon.outerHTML}<span class="card-detail-value rtsp-url-display">${maskRtspUrlPassword(source.url)}</span></div>`;
    if (hasCustomRoi) {
        const cropIcon = document.createElement('span'); setIcon(cropIcon, 'UI_CROP');
        detailsHtml += `<div class="card-detail-line">${cropIcon.outerHTML}<span class="card-detail-value">ROI: X:${roi.x}, Y:${roi.y}, W:${roi.width}, H:${roi.height}</span></div>`;
    }
    
    let itemClasses = "rtsp-source-item card-item-clickable";
    if (isEditing) itemClasses += " is-editing-highlight";

    const actionButtons: ActionButtonConfig[] = [{
        action: 'delete',
        title: translate('deleteTooltip', { item: source.name }),
        iconKey: 'UI_DELETE_FOREVER',
        extraClasses: ['btn-icon-danger', 'delete-rtsp-btn'],
        translate: translate,
    }];

    const card = createCardElement({
        iconName: 'router', title: `${source.name}${onDemandText}`,
        actionButtons, detailsHtml,
        itemClasses: itemClasses, datasetAttributes: { index: String(index) },
        translate: translate,
    });
    
    (card.querySelector('.delete-rtsp-btn') as HTMLElement)?.setAttribute('data-index', String(index));
    return card;
}