/* FILE: packages/backend/src/utils/companion-connector.ts */
import WebSocket from 'ws';

const COMPANION_APP_PORT = 9003;
const CONNECTION_TIMEOUT_MS = 5000;

/**
 * Establishes a WebSocket connection to a companion app instance.
 * @param host - The hostname or IP address of the companion app.
 * @returns A promise that resolves with the connected WebSocket instance.
 * @throws An error if the connection fails, times out, or closes unexpectedly.
 */
export async function connectToCompanion(host: string): Promise<WebSocket> {
    // The companion server's WebSocket endpoint is specifically at the '/ws' path.
    const targetUrl = `ws://${host}:${COMPANION_APP_PORT}/ws`;
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(targetUrl);
        let resolved = false;

        const connectTimeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.terminate();
                reject(new Error(`Companion connection timed out to ${targetUrl}.`));
            }
        }, CONNECTION_TIMEOUT_MS);

        const cleanupListeners = () => {
            ws.removeAllListeners('open');
            ws.removeAllListeners('error');
            ws.removeAllListeners('close');
        };

        ws.on('open', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(connectTimeout);
                cleanupListeners();
                resolve(ws);
            }
        });

        ws.on('error', (err: Error & { code?: string }) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(connectTimeout);
                cleanupListeners();
                // REFACTOR: Add specific error messages for common network issues.
                if (err.code === 'ECONNREFUSED') {
                    reject(new Error(`Companion connection refused. Is the Companion App running on ${host}?`));
                } else if (err.code === 'ENOTFOUND') {
                    reject(new Error(`Companion host not found. Could not resolve DNS for '${host}'.`));
                } else {
                    reject(new Error(`Companion connection failed: ${err.message || 'Unknown WebSocket error'}`));
                }
            }
        });

        ws.on('close', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(connectTimeout);
                cleanupListeners();
                reject(new Error('Companion connection closed unexpectedly.'));
            }
        });
    });
}