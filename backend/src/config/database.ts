// =============================================================================
// Database Client Singleton — BPM & SpO₂ Monitoring Dashboard
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['warn', 'error'],
});

export { prisma };

export function getPrismaClient(): PrismaClient {
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
