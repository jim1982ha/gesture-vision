/* FILE: packages/frontend/src/components/settings/cards/RtspSourceCard.tsx */
import { useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { type RtspSourceConfig, normalizeNameForMtx } from '#shared/index.js';
import { CardRoot, CardHeader, CardIcon, CardTitle, CardActions, CardDetails, CardDetailLine } from '#frontend/components/shared/cards/Card.js';

interface RtspSourceCardProps {
  source: RtspSourceConfig;
  onEdit: () => void;
  onDelete: () => void;
}

export const RtspSourceCard = ({ source, onEdit, onDelete }: RtspSourceCardProps) => {
    const context = useContext(AppContext);
    if (!context) return null;
    const { translate } = context.services.translationService;

    const onDemandText = source.sourceOnDemand ? ` (${translate("rtspOnDemandIndicator")})` : "";
    const hasCustomRoi = source.roi && (source.roi.x !== 0 || source.roi.y !== 0 || source.roi.width !== 100 || source.roi.height !== 100);

    const maskRtspUrlPassword = (url: string) => url.replace(/(rtsp:\/\/(?:[^:@/]+:)?)([^:@/]+)(@)/, "$1********$3");
    const normalizedName = normalizeNameForMtx(source.name);

    return (
        <CardRoot id={`rtsp-card-${normalizedName}`} onClick={onEdit}>
            <CardHeader id={`rtsp-card-header-${normalizedName}`}>
                <CardIcon id={`rtsp-card-icon-${normalizedName}`} iconKey="UI_RTSP_STREAM" />
                <CardTitle id={`rtsp-card-title-${normalizedName}`}>{source.name}{onDemandText}</CardTitle>
                <CardActions id={`rtsp-card-actions-${normalizedName}`}>
                    <button id={`rtsp-card-edit-button-${normalizedName}`} onClick={(e) => { e.stopPropagation(); onEdit(); }} className="btn btn-icon edit-btn" title={translate('editTooltip', { item: source.name })}>
                        <span ref={el => el && setIcon(el, 'UI_EDIT_NOTE')}></span>
                    </button>
                    <button id={`rtsp-card-delete-button-${normalizedName}`} onClick={(e) => { e.stopPropagation(); onDelete(); }} className="btn btn-icon btn-icon-danger delete-btn" title={translate('deleteTooltip', { item: source.name })}>
                        <span ref={el => el && setIcon(el, 'UI_DELETE_FOREVER')}></span>
                    </button>
                </CardActions>
            </CardHeader>
            <CardDetails id={`rtsp-card-details-${normalizedName}`}>
                <CardDetailLine id={`rtsp-card-url-${normalizedName}`} iconKey="UI_LINK">
                    <span className="rtsp-url-display">{maskRtspUrlPassword(source.url)}</span>
                </CardDetailLine>
                {hasCustomRoi && (
                    <CardDetailLine id={`rtsp-card-roi-${normalizedName}`} iconKey="UI_CROP">
                        ROI: X:{source.roi!.x}, Y:{source.roi!.y}, W:{source.roi!.width}, H:{source.roi!.height}
                    </CardDetailLine>
                )}
            </CardDetails>
        </CardRoot>
    );
};