/* FILE: packages/backend/src/mtx-api-helpers.ts */
const MTX_API_ADDRESS_VAR = process.env.MTX_APIADDRESS || "0.0.0.0:9997";
const [rawHost, rawPort] = MTX_API_ADDRESS_VAR.includes(':')
    ? MTX_API_ADDRESS_VAR.split(':', 2) // Split only on the first colon
    : ["0.0.0.0", MTX_API_ADDRESS_VAR]; // Assume it's just a port if no colon

const MTX_API_HOST = rawHost === "" ? "0.0.0.0" : rawHost; // Default to 0.0.0.0 if host part is empty (e.g. from ":9997")
const MTX_API_PORT = rawPort || "9997"; // Default port if not specified
const MTX_API_BASE_URL = `http://${MTX_API_HOST}:${MTX_API_PORT}`;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

export async function callMtxApi<T = unknown>(endpoint: string, method: string = 'GET', body: unknown = null): Promise<T | null> {
    const url = `${MTX_API_BASE_URL}${endpoint}`;

    const options: RequestInit = {
        method: method,
        headers: {},
    };

    if (body !== null) {
        options.body = JSON.stringify(body);
        (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        options.signal = controller.signal;

        try {
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            let responseBody: T | string | null = null;
            const contentType = response.headers.get("content-type");
            const isJson = contentType?.includes("application/json");
            const canHaveBody = response.status !== 204;

            if (canHaveBody) {
                try {
                    const textBody = await response.text();
                    if (isJson && textBody) {
                        responseBody = JSON.parse(textBody) as T;
                    } else if (textBody) {
                        responseBody = textBody as string;
                    }
                } catch (_e: unknown) {
                    console.warn(`[MTX API Helper] Could not read/parse response body for status ${response.status}`, _e);
                    responseBody = "(Could not read body)";
                }
            }

            if (!response.ok) {
                 const errMsg = `MediaMTX API Error (${method} ${endpoint}): ${response.status} ${response.statusText}. Body: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`;
                 console.error(`[MTX API Helper] FAILED ${method} ${url}: ${response.status}`, responseBody);
                 throw new Error(errMsg);
             }
    
            if (typeof responseBody === 'object' && responseBody !== null) {
                return responseBody as T;
            } else {
                return null;
            }
        } catch (error: unknown) {
            clearTimeout(timeoutId);
            const typedError = error as Error & { cause?: { code?: string } };
            const causeCode = typedError.cause?.code;

            const isRetryable = causeCode === 'ECONNREFUSED' || typedError.name === 'AbortError';

            if (isRetryable && attempt < MAX_RETRIES) {
                console.warn(`[MTX API Helper] Attempt ${attempt} failed to connect to ${url} (${typedError.name}/${causeCode}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
            }

            const message = typedError.message || String(error);
            const name = typedError.name || 'UnknownError';
            console.error(`[MTX API Helper] FETCH ERROR (Final Attempt) ${method} ${url}:`, name, message, causeCode);

            if (name === 'AbortError') {
                throw new Error(`MediaMTX API call timed out (${method} ${url}).`);
            } else if (causeCode === 'ECONNREFUSED') {
                throw new Error(`MediaMTX API call failed: Connection refused to ${url}. Is MediaMTX running and API enabled?`);
            } else {
                throw new Error(message || `MediaMTX API call failed (${method} ${url})`);
            }
        }
    }

    // This path should not be reached if the loop logic is correct.
    throw new Error(`MediaMTX API call to ${url} failed after ${MAX_RETRIES} attempts.`);
}