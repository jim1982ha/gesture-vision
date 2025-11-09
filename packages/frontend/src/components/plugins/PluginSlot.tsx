/* FILE: packages/frontend/src/components/plugins/PluginSlot.tsx */
import { useContext, useEffect, useState } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';

interface PluginSlotProps {
  slotId: string;
  className?: string;
}

export const PluginSlot = ({ slotId, className }: PluginSlotProps) => {
    const context = useContext(AppContext);
    const manifests = useAppStore(state => state.pluginManifests);
    const [contributions, setContributions] = useState<React.ReactNode[]>([]);
    
    useEffect(() => {
        if (!context) return;
        
        let isMounted = true;
        const { pluginUIService } = context.services;

        const updateContributions = async () => {
            const componentPromises = manifests
                .filter(m => m.status === 'enabled' && m.capabilities.providesUIContribution && m.frontendEntry)
                .map(async manifest => {
                    const module = await pluginUIService.loadPluginFrontendModule(manifest.id);
                    if (!module) return null;
                    
                    if (module.UIComponent && module.pluginSlot === slotId) {
                        return <module.UIComponent key={manifest.id} />;
                    }
                    if (slotId === 'header-plugin-contribution-slot' && module.HeaderComponent) {
                         return <module.HeaderComponent key={manifest.id} />;
                    }
                    return null;
                });
            
            const components = await Promise.all(componentPromises);
            if (isMounted) {
                setContributions(components.filter(Boolean));
            }
        };

        updateContributions();
        
        return () => { isMounted = false; };
    }, [context, manifests, slotId]);

    if (!context || contributions.length === 0) {
        return null;
    }

    return (
        <div id={slotId} className={className}>
            {contributions}
        </div>
    );
};