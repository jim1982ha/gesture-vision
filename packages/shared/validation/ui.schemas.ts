/* FILE: packages/shared/validation/ui.schemas.ts */
import { z } from 'zod';
import { GESTURE_CATEGORY_ICONS } from '../constants/icons.js';

export const GestureDisplayInfoSchema = z.object({
    name: z.string(),
    formattedName: z.string(),
    category: z.enum(Object.keys(GESTURE_CATEGORY_ICONS) as [string, ...string[]]),
    iconDetails: z.object({
        iconName: z.string(),
        iconType: z.string(),
        defaultEmoji: z.string().optional(),
    }),
});
export type GestureDisplayInfo = z.infer<typeof GestureDisplayInfoSchema>;