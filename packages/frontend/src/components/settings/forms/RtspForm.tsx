/* FILE: packages/frontend/src/components/settings/forms/RtspForm.tsx */
import React, { useState, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { pubsub, UI_EVENTS, type RtspSourceConfig } from '#shared/index.js';

const DEFAULT_ROI_FORM_VALUES = { x: 0, y: 0, width: 100, height: 100 };

interface RtspFormProps {
  source: Partial<RtspSourceConfig> | null;
  onCancel: () => void;
  onSave: (data: RtspSourceConfig) => void;
}

export const RtspForm = ({ source, onCancel, onSave }: RtspFormProps) => {
    const context = useContext(AppContext);
    const { translate } = context!.services.translationService;
    const [formData, setFormData] = useState({
        name: source?.name || '',
        url: source?.url || '',
        sourceOnDemand: source?.sourceOnDemand || false,
        roi: source?.roi || { ...DEFAULT_ROI_FORM_VALUES }
    });
    
    if (!context) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type, checked } = e.target;
        if (id.startsWith('roi')) {
            const key = id.substring(3).toLowerCase();
            setFormData(prev => ({ ...prev, roi: { ...prev.roi, [key]: parseFloat(value) } }));
        } else {
            setFormData(prev => ({ ...prev, [id]: type === 'checkbox' ? checked : value }));
        }
    };

    const handleSave = () => {
        if (!formData.name || !formData.url || !formData.url.toLowerCase().startsWith("rtsp://")) {
            pubsub.publish(UI_EVENTS.SHOW_ERROR, { messageKey: "rtspNameUrlRequired" });
            return;
        }
        onSave(formData as RtspSourceConfig);
    };

    return (
        <div className="embedded-form-container">
            <h5 className="text-base font-semibold mb-4">{translate(source?.name ? "editXTitle" : "addXTitle", { item: "RTSP Source" })}</h5>
            <div className="form-group">
                <label htmlFor="name" className="form-label">{translate('rtspNameLabel')}</label>
                <input type="text" id="name" className="form-control" value={formData.name} onChange={handleChange} placeholder={translate('rtspNamePlaceholder')} />
            </div>
            <div className="form-group">
                <label htmlFor="url" className="form-label">{translate('rtspUrlLabel')}</label>
                <input type="text" id="url" className="form-control" value={formData.url} onChange={handleChange} placeholder={translate('rtspUrlPlaceholder')} />
                <small className="form-help-text">{translate('rtspUrlHelp')}</small>
            </div>
            <div className="form-group form-group-checkbox-inline">
                <input type="checkbox" id="sourceOnDemand" className="form-checkbox" checked={formData.sourceOnDemand} onChange={handleChange} />
                <label htmlFor="sourceOnDemand" className="form-label">{translate('rtspSourceOnDemandLabel')}</label>
            </div>
            <fieldset id="rtsp-form-roi-fieldset" className="form-group">
                <legend className="form-label">{translate('rtspRoiSettingsLabel')}</legend>
                <div className="form-row">
                    <div className="form-group"><label htmlFor="roiX" className="form-label">{translate('roiLeftOffsetLabel')}</label><input type="number" id="roiX" className="form-control" min="0" max="100" step="1" value={formData.roi.x} onChange={handleChange} /></div>
                    <div className="form-group"><label htmlFor="roiY" className="form-label">{translate('roiTopOffsetLabel')}</label><input type="number" id="roiY" className="form-control" min="0" max="100" step="1" value={formData.roi.y} onChange={handleChange} /></div>
                </div>
                <div className="form-row">
                    <div className="form-group"><label htmlFor="roiWidth" className="form-label">{translate('roiWidthLabel')}</label><input type="number" id="roiWidth" className="form-control" min="1" max="100" step="1" value={formData.roi.width} onChange={handleChange} /></div>
                    <div className="form-group"><label htmlFor="roiHeight" className="form-label">{translate('roiHeightLabel')}</label><input type="number" id="roiHeight" className="form-control" min="1" max="100" step="1" value={formData.roi.height} onChange={handleChange} /></div>
                </div>
                <small className="form-help-text">{translate('rtspRoiHelpUpdated')}</small>
            </fieldset>
            <div id="rtsp-form-actions" className="form-actions-container">
                <button id="rtsp-form-cancel-button" onClick={onCancel} className="btn btn-secondary">
                    <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span><span>{translate('cancel')}</span>
                </button>
                <button id="rtsp-form-save-button" onClick={handleSave} className="btn btn-primary">
                    <span ref={el => el && setIcon(el, source?.name ? 'UI_SAVE' : 'UI_ADD')}></span><span>{translate(source?.name ? 'update' : 'add')}</span>
                </button>
            </div>
        </div>
    );
};