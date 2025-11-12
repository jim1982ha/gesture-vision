/* FILE: packages/frontend/src/components/plugins/PluginSlot.tsx */
import { useContext, useEffect, useState, Suspense, type ComponentType } from 'react';
import { AppContext } from '#frontend/contexts/AppContext.js';
import { useAppStore } from '#frontend/hooks/useAppStore.js';
import type { PluginUIContext } from '#frontend/types/index.js';

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


export const PluginOverlaySlot = () => {
    const context = useContext(AppContext);
    const activeOverlay = useAppStore(state => state.activeOverlays.at(-1));
    const manifests = useAppStore(state => state.pluginManifests);

    const [Component, setComponent] = useState<{ C: ComponentType<{ context: PluginUIContext, onClose: () => void }>, pluginId: string } | null>(null);

    useEffect(() => {
        let isMounted = true;
        setComponent(null);

        if (!activeOverlay || !context) return;
        
        const { pluginUIService } = context.services;
        const matchingManifest = manifests.find(m => {
            const module = pluginUIService.getLoadedModuleById(m.id);
            return m.status === 'enabled' && module?.overlayId === activeOverlay.id;
        });

        if (matchingManifest) {
            pluginUIService.loadPluginFrontendModule(matchingManifest.id)
                .then(module => {
                    if (isMounted && module?.OverlayComponent) {
                        setComponent({ C: module.OverlayComponent, pluginId: matchingManifest.id });
                    }
                })
                .catch(err => console.error(`[PluginOverlaySlot] Error loading overlay for ${matchingManifest.id}`, err));
        }
        
        return () => { isMounted = false; };
    }, [activeOverlay, manifests, context]);

    if (!Component || !context) {
        return null;
    }

    const { C, pluginId } = Component;
    const { pluginUIService } = context.services;
    const { actions } = context.appStore.getState();
    const pluginContext = pluginUIService.getPluginUIContext(pluginId);
    
    return (
        <Suspense fallback={<div className="modal visible"></div>}>
            <C context={pluginContext} onClose={() => actions.closeCurrentOverlay()} />
        </Suspense>
    );
};