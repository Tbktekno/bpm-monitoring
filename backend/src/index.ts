// =============================================================================
// BPM & SpO₂ Monitoring Dashboard — Entry Point
// =============================================================================

import { server } from './server';
import { env } from './config/env';
import { logger } from './server/middleware/request-logger';
import { prisma } from './config/database';
import { startMdnsAdvertising } from './shared/mdns-advertiser';

async function main(): Promise<void> {
  try {
    // Verify database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Start server
    server.listen(env.port, () => {
      logger.info(`========================================`);
      logger.info(`  BPM & SpO₂ Monitoring Dashboard`);
      logger.info(`  Environment: ${env.nodeEnv}`);
      logger.info(`  HTTP + Socket.IO: http://localhost:${env.port}`);
      logger.info(`  gRPC target: ${env.grpcHost}:${env.grpcPort}`);
      logger.info(`========================================`);

      // Start mDNS advertising — ESP8266 auto-find backend via mDNS
      // Pattern: rfid-attendance menggunakan mDNS queryService sebagai primer
      startMdnsAdvertising();
    });
  } catch (err: any) {
    logger.error(`Failed to start server: ${err.message}`);
    logger.error(err.stack || '');
    process.exit(1);
  }
}

main();
