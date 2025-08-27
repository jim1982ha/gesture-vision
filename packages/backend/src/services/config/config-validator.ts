/* FILE: packages/backend/src/services/config/config-validator.ts */
import { z } from 'zod';

import { FullConfigurationSchema } from '#shared/validation/schemas.js';

import type {
  FullConfiguration,
  SectionValidationResult,
  ValidationErrorDetail,
} from '#shared/types/index.js';

export class ConfigValidator {
  public validateFullConfig(data: unknown):
    | {
        success: true;
        data: z.infer<typeof FullConfigurationSchema>;
      }
    | {
        success: false;
        errors: ValidationErrorDetail[];
      } {
    const result = FullConfigurationSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    const errors: ValidationErrorDetail[] = result.error.issues.map(
      (e: z.ZodIssue) => ({
        field: e.path.join('.'),
        messageKey: e.message,
        details: { code: e.code },
      })
    );
    return { success: false, errors };
  }

  public validateSection<K extends keyof FullConfiguration>(
    key: K,
    data: unknown
  ): SectionValidationResult {
    const schemaForKey =
      FullConfigurationSchema.shape[
        key as keyof typeof FullConfigurationSchema.shape
      ];
    const result = schemaForKey.safeParse(data);

    if (result.success) {
      return { isValid: true };
    }

    const errors: ValidationErrorDetail[] = result.error.issues.map(
      (e: z.ZodIssue) => ({
        field: e.path.length > 0 ? `${key}.${e.path.join('.')}` : key,
        messageKey: e.message,
        details: { code: e.code, value: data },
      })
    );

    return { isValid: false, errors };
  }
}