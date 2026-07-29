// =============================================================================
// UDP Broadcast Discovery — ESP8266 auto-find backend without mDNS/IP config
// =============================================================================
// Cara kerja:
//   1. ESP8266 broadcast UDP packet "BPM-DISCOVERY" ke port 5500
//   2. Backend ini mendengar dan merespon dengan IP + Port
//   3. ESP8266 langsung konek tanpa perlu config IP manual
//
// Tidak perlu Bonjour / avahi / mDNS — work di jaringan manapun!
// =============================================================================

import dgram from 'node:dgram';
import os from 'node:os';
import { logger } from '../server/middleware/request-logger';
import { env } from '../config/env';

const DISCOVERY_PORT = 5500;
const DISCOVERY_MAGIC = 'BPM-DISCOVERY';
const DISCOVERY_RESPONSE = 'BPM-SERVER';

let udpSocket: dgram.Socket | null = null;

/**
 * Dapatkan IP lokal server yang bisa dijangkau ESP8266.
 * Mencari interface non-internal IPv4 pertama (eth0, wlan0, etc).
 */
function getLocalIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

/**
 * Start UDP discovery listener.
 * Mendengar broadcast dari ESP8266 dan merespon dengan alamat server.
 */
export function startUdpDiscovery(): void {
  try {
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    udpSocket.on('error', (err: Error) => {
      logger.warn(`[UDP-Discovery] Error: ${err.message}`);
    });

    udpSocket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      const received = msg.toString().trim();
      if (received === DISCOVERY_MAGIC) {
        // Kirim response: IP server + port
        // ⚠ GUNAKAN IP SERVER, BUKAN rinfo.address (itu IP ESP8266!)
        const serverIp = getLocalIp();
        const response = JSON.stringify({
          type: DISCOVERY_RESPONSE,
          host: serverIp,           // ✅ IP server yang benar
          port: env.port,
        });

        udpSocket!.send(response, rinfo.port, rinfo.address, (err) => {
          if (err) {
            logger.warn(`[UDP-Discovery] Gagal kirim response ke ${rinfo.address}: ${err.message}`);
          } else {
            logger.info(`[UDP-Discovery] → ESP8266 ditemukan di ${rinfo.address}:${rinfo.port}`);
          }
        });
      }
    });

    udpSocket.bind(DISCOVERY_PORT, () => {
      udpSocket!.setBroadcast(true);
      logger.info(`[UDP-Discovery] Listening on port ${DISCOVERY_PORT} for ESP8266 discovery`);
    });
  } catch (err: any) {
    logger.warn(`[UDP-Discovery] Gagal start: ${err.message}`);
  }
}

/**
 * Stop UDP discovery.
 */
export function stopUdpDiscovery(): void {
  try {
    if (udpSocket) {
      udpSocket.close();
      udpSocket = null;
      logger.info('[UDP-Discovery] Stopped');
    }
  } catch { /* ignore */ }
}
