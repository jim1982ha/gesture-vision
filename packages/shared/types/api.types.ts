/* FILE: packages/shared/types/api.types.ts */

export interface ActionDetails {
    gestureName: string;
    confidence: number;
    timestamp: number;
}
  
export interface ActionResult {
    success: boolean;
    message?: string;
    details?: unknown;
}

export interface ValidationErrorDetail {
    field: string;
    messageKey: string;
    details?: unknown;
}

export interface SectionValidationResult {
    isValid: boolean;
    error?: ValidationErrorDetail;
    errors?: ValidationErrorDetail[];
}