import { PrismaClient } from "@prisma/client";

// Evita crear múltiples instancias de PrismaClient en desarrollo
// (Next.js recarga módulos en caliente y duplicaría conexiones a la BD).
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
