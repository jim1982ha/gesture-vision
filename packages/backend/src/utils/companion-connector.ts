/* FILE: packages/backend/src/utils/companion-connector.ts */
import WebSocket from 'ws';

const COMPANION_APP_PORT = 9003;

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
        }, 5000);

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

        ws.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(connectTimeout);
                cleanupListeners();
                reject(new Error(`Companion connection failed: ${err.message || 'Unknown WebSocket error'}`));
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