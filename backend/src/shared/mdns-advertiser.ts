// =============================================================================
// mDNS Advertiser — membuat server backend dikenal di jaringan lokal
// =============================================================================
// Dengan mDNS, ESP8266 dapat menemukan server backend secara otomatis
// tanpa perlu mengkonfigurasi IP address secara manual.
//
// Yang di-advertise:
//   1. Hostname: bpm-server.local (bisa di-resolve via mDNS)
//   2. Service:  _bpm-monitor._tcp (bisa di-query oleh ESP8266)
//
// Install: npm install bonjour-service
// =============================================================================

import Bonjour from 'bonjour-service';
import { logger } from '../server/middleware/request-logger';
import { env } from '../config/env';

let bonjourInstance: any = null;

/**
 * Start mDNS advertising.
 * 
 * Server akan dikenal sebagai:
 *   - bpm-server.local (via mDNS hostname resolution)
 *   - Service _bpm-monitor._tcp (via DNS-SD service discovery)
 */
export function startMdnsAdvertising(): void {
  try {
    bonjourInstance = new Bonjour();

    // Advertise service — ESP8266 akan query "bpm-monitor" via MDNS.queryService()
    bonjourInstance.publish({
      name: 'bpm-server',
      type: 'bpm-monitor',
      port: env.port,
      txt: {
        deviceId: 'backend-server',
        version: '1.0.0',
      },
    });

    logger.info(`[mDNS] Advertising as "bpm-server.local" on port ${env.port}`);
  } catch (err: any) {
    logger.warn(`[mDNS] Failed to start: ${err.message}. mDNS tidak tersedia.`);
    logger.warn('[mDNS] ESP8266 harus dikonfigurasi dengan IP manual.');
  }
}

/**
 * Stop mDNS advertising.
 */
export function stopMdnsAdvertising(): void {
  try {
    if (bonjourInstance) {
      bonjourInstance.unpublishAll(() => {
        bonjourInstance?.destroy();
        bonjourInstance = null;
        logger.info('[mDNS] Advertising stopped');
      });
    }
  } catch {
    // Ignore errors on shutdown
  }
}
