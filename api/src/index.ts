import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { prisma } from './prisma.js'
import { generateReply } from './llm.js'

const PORT = Number(process.env.PORT ?? 3101)
const CORS_ORIGIN = process.env.CORS_ORIGIN

function buildCorsOrigin() {
  // If not specified, be permissive in dev (helps when Vite changes ports).
  // In production, set CORS_ORIGIN explicitly.
  if (!CORS_ORIGIN || CORS_ORIGIN.trim() === '' || CORS_ORIGIN.trim() === '*') return true

  const allowed = CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Support simple wildcards like "http://localhost:*".
  return function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
    // Allow non-browser requests (no Origin header)
    if (!origin) return cb(null, true)

    for (const entry of allowed) {
      if (entry.endsWith(':*')) {
        const prefix = entry.slice(0, -2)
        if (origin.startsWith(prefix)) return cb(null, true)
      }
      if (origin === entry) return cb(null, true)
    }

    return cb(new Error(`CORS blocked for origin: ${origin}`))
  }
}

const app = express()
app.use(
  cors({
    origin: buildCorsOrigin(),
  }),
)
app.use(express.json({ limit: '100kb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const postMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long'),
  sessionId: z.string().trim().min(1).optional(),
})

app.post('/chat/message', async (req, res) => {
  try {
    const parsed = postMessageSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() })
    }

    const { message, sessionId } = parsed.data

    const conversation = sessionId
      ? await prisma.conversation.findUnique({ where: { id: sessionId } })
      : null

    const activeConversation =
      conversation ?? (await prisma.conversation.create({ data: {} }))

    await prisma.message.create({
      data: {
        conversationId: activeConversation.id,
        sender: 'user',
        text: message,
      },
    })

    const history = await prisma.message.findMany({
      where: { conversationId: activeConversation.id },
      orderBy: { createdAt: 'asc' },
      take: 30,
    })

    const reply = await generateReply(history)

    await prisma.message.create({
      data: {
        conversationId: activeConversation.id,
        sender: 'ai',
        text: reply,
      },
    })

    return res.json({ reply, sessionId: activeConversation.id })
  } catch (err: any) {
    console.error(err)

    // Prisma/SQLite common failure when DB/tables have not been created yet.
    // Example: "The table `main.Message` does not exist".
    const msg = String(err?.message ?? '')
    if (msg.includes('does not exist') || msg.includes('no such table')) {
      return res.status(503).json({
        error:
          'Server database is not initialized. Run `npm -w api run prisma:generate` and `npx -w api prisma db push`, then retry.',
      })
    }

    return res.status(500).json({
      error: 'Something went wrong. Please try again.',
      ...(process.env.NODE_ENV === 'production'
        ? {}
        : { details: { message: msg, name: err?.name, code: err?.code } }),
    })
  }
})

app.get('/chat/history', async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId ?? '').trim()
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: sessionId },
    })

    if (!conversation) {
      return res.json({ sessionId, messages: [] })
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: sessionId },
      orderBy: { createdAt: 'asc' },
    })

    return res.json({ sessionId, messages })
  } catch (err: any) {
    console.error(err)

    const msg = String(err?.message ?? '')
    if (msg.includes('does not exist') || msg.includes('no such table')) {
      return res.status(503).json({
        error:
          'Server database is not initialized. Run `npm -w api run prisma:generate` and `npx -w api prisma db push`, then refresh.',
      })
    }

    return res.status(500).json({
      error: 'Could not load history. Please refresh.',
      ...(process.env.NODE_ENV === 'production'
        ? {}
        : { details: { message: msg, name: err?.name, code: err?.code } }),
    })
  }
})

const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Either stop the other process, or start the API with a different PORT (e.g. PORT=3101).`,
    )
    process.exit(1)
  }
  console.error('Server error', err)
  process.exit(1)
})
