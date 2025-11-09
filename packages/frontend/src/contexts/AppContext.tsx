/* FILE: packages/frontend/src/contexts/AppContext.tsx */
import { createContext } from 'react';
import type { AppContextType } from '#frontend/types/index.js';

export const AppContext = createContext<AppContextType | null>(null);