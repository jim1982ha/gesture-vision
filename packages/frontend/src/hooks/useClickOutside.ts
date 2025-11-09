/* FILE: packages/frontend/src/hooks/useClickOutside.ts */
import { useEffect, useRef } from 'react';

/**
 * A custom hook that triggers a callback when a click is detected outside of the referenced element.
 * @param callback The function to call when a click outside is detected.
 * @returns A React ref object to be attached to the element to monitor.
 */
export const useClickOutside = <T extends HTMLElement>(callback: () => void) => {
    const ref = useRef<T>(null);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [callback]);

    return ref;
};