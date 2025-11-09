/* FILE: packages/frontend/src/components/settings/forms/CustomGestureForm.tsx */
import { useState, useContext } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { setIcon } from '#frontend/ui/helpers/ui-helpers.js';
import { WEBSOCKET_EVENTS, type CustomGestureMetadata } from '#shared/index.js';
import { webSocketService } from '#frontend/services/websocket-service.js';

interface CustomGestureFormProps {
  gesture: CustomGestureMetadata;
  onCancel: () => void;
  onSave: () => void;
}

export const CustomGestureForm = ({ gesture, onCancel, onSave }: CustomGestureFormProps) => {
  const context = useContext(AppContext);
  const { translate } = context!.services.translationService;
  const [name, setName] = useState(gesture.name);
  const [description, setDescription] = useState(gesture.description || '');

  if (!context) return null;

  const handleSave = () => {
    webSocketService.sendMessage({
      type: WEBSOCKET_EVENTS.UPDATE_CUSTOM_GESTURE,
      payload: { id: gesture.id, oldName: gesture.name, newName: name, newDescription: description }
    });
    onSave();
  };

  return (
    <div className="embedded-form-container">
      <h5 className="text-base font-semibold mb-4">{translate('editXTitle', { item: gesture.name })}</h5>
      <div className="form-group">
        <label htmlFor="edit-custom-gesture-name-input" className="form-label">{translate('nameLabel')}</label>
        <input id="edit-custom-gesture-name-input" type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="edit-custom-gesture-description-input" className="form-label">{translate('descriptionOptionalLabel')}</label>
        <textarea id="edit-custom-gesture-description-input" className="form-control" value={description} onChange={e => setDescription(e.target.value)} rows={3}></textarea>
      </div>
      <div className="form-actions-container">
        <button onClick={onCancel} className="btn btn-secondary">
          <span ref={el => el && setIcon(el, 'UI_CANCEL')}></span><span>{translate('cancel')}</span>
        </button>
        <button onClick={handleSave} className="btn btn-primary">
          <span ref={el => el && setIcon(el, 'UI_SAVE')}></span><span>{translate('save')}</span>
        </button>
      </div>
    </div>
  );
};