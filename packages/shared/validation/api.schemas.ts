/* FILE: packages/shared/validation/api.schemas.ts */
import { z } from 'zod';

export const ActionDetailsSchema = z.object({
  gestureName: z.string(),
  confidence: z.number(),
  timestamp: z.number(),
});
export type ActionDetails = z.infer<typeof ActionDetailsSchema>;

export const ActionResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const ValidationErrorDetailSchema = z.object({
    field: z.string(),
    messageKey: z.string(),
    details: z.unknown().optional(),
});
export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

export const SectionValidationResultSchema = z.object({
    isValid: z.boolean(),
    error: ValidationErrorDetailSchema.optional(),
    errors: z.array(ValidationErrorDetailSchema).optional(),
});
export type SectionValidationResult = z.infer<typeof SectionValidationResultSchema>;