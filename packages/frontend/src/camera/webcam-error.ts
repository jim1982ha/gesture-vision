/* FILE: packages/frontend/src/camera/webcam-error.ts */

/**
 * Custom error class for WebcamManager specific errors.
 */
export class WebcamError extends Error {
    public code: string;
    constructor(code: string, message?: string) {
      const fullCode = code.startsWith("WEBCAM_") ? code : `WEBCAM_${code}`;
      // Provide a default message if one is not passed.
      super(message || 'An unspecified webcam error occurred.');
      this.code = fullCode;
      this.name = "WebcamError";
    }
  }