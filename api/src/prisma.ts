import { PrismaClient } from '@prisma/client'

// For deployment (Neon/Postgres), we require DATABASE_URL to be set.
// (Neon provides a `postgresql://...` connection string)
if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL')
}

export const prisma = new PrismaClient()
