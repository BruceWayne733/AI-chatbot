import OpenAI from 'openai'
import type { Message } from '@prisma/client'

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-nano'
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL ?? 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are a helpful support agent for a small e-commerce store called Spur Shop.
Answer clearly and concisely. If you don't know, say you don't know and suggest contacting human support.
Do not invent policies that are not in the provided FAQ.`

const FAQ = `FAQ / Store policies:
- Shipping: We ship across India in 2-5 business days. USA/International shipping is available and takes 7-12 business days. Shipping is free for orders over ₹999 in India.
- Returns: 14-day return window from delivery date. Items must be unused and in original packaging. Refunds are processed to the original payment method within 5-7 business days after inspection.
- Exchanges: Size exchanges are supported within 14 days, subject to stock availability.
- Support hours: Mon–Sat, 10am–6pm IST. Typical response time under 2 hours during business hours.
- Order issues: For damaged/wrong items, contact support within 48 hours with photos.`

function toChatHistory(messages: Message[]) {
  // last N already handled by caller; ensure formatting is safe
  return messages.map((m) => ({
    role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text,
  }))
}

function extractResponseText(resp: any): string {
  // `output_text` is the convenient field, but it can be empty depending on SDK/model.
  const direct = String(resp?.output_text ?? '').trim()
  if (direct) return direct

  // Try to pull text from `output` message content.
  const output = resp?.output
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          const text = String(c?.text ?? c?.value ?? '').trim()
          if (text) return text
        }
      }
    }
  }

  return ''
}

export async function generateReply(history: Message[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return 'LLM is not configured on the server (missing OPENAI_API_KEY). Please contact support.'
  }

  const client = new OpenAI({ apiKey })

  try {
    const messages = [
      { role: 'system' as const, content: `${SYSTEM_PROMPT}\n\n${FAQ}` },
      ...toChatHistory(history),
    ]

    // gpt-5* models are best used via the Responses API.
    if (MODEL.startsWith('gpt-5')) {
      const resp = await client.responses.create({
        model: MODEL,
        input: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${FAQ}` },
          ...messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
        ],
        // Cost/latency control
        max_output_tokens: 300,
      })

      const text = extractResponseText(resp)
      if (text) return text

      // Some accounts/models can return only `reasoning` without a final message.
      // Fall back to a widely-available chat model so the app still works.
      console.error('OpenAI Responses API returned no text; falling back to chat.completions', {
        model: MODEL,
        fallbackModel: FALLBACK_MODEL,
        id: resp?.id,
        output: resp?.output,
      })

      const completion = await client.chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 300,
      })

      const fallbackText = completion.choices?.[0]?.message?.content?.trim()
      if (!fallbackText) {
        return 'Sorry — I could not generate a response. Please try again.'
      }
      return fallbackText
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 300,
    })

    const text = completion.choices?.[0]?.message?.content?.trim()
    if (!text) return 'Sorry — I could not generate a response. Please try again.'
    return text
  } catch (err: any) {
    // Keep errors user-friendly; log server-side.
    console.error('OpenAI error', err)

    const status = err?.status
    if (status === 401) {
      return 'The AI service is not configured correctly (invalid API key). Please contact support.'
    }
    if (status === 429) {
      return 'The AI service is busy right now (rate limited). Please try again in a minute.'
    }

    return 'Sorry — the AI service is temporarily unavailable. Please try again.'
  }
}
