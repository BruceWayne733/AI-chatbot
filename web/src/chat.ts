export type Sender = 'user' | 'ai'

export type ChatMessage = {
  id?: string
  sender: Sender
  text: string
  createdAt?: string
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3101'
const SESSION_STORAGE_KEY = 'spur_chat_session_id'

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`Missing element: ${selector}`)
  return node
}

function scrollToBottom(container: HTMLElement) {
  container.scrollTop = container.scrollHeight
}

function renderMessage(container: HTMLElement, msg: ChatMessage) {
  const row = document.createElement('div')
  row.className = `msg-row ${msg.sender}`

  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  bubble.textContent = msg.text

  row.appendChild(bubble)
  container.appendChild(row)
}

function setTyping(typing: boolean) {
  const node = el<HTMLDivElement>('#typing')
  node.style.display = typing ? 'block' : 'none'
}

function setError(text: string | null) {
  const node = el<HTMLDivElement>('#error')
  node.textContent = text ?? ''
  node.style.display = text ? 'block' : 'none'
}

async function fetchHistory(sessionId: string): Promise<ChatMessage[]> {
  const url = new URL(`${API_BASE}/chat/history`)
  url.searchParams.set('sessionId', sessionId)

  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load history')
  const data = (await res.json()) as { messages: ChatMessage[] }
  return data.messages ?? []
}

async function postMessage(message: string, sessionId?: string) {
  const res = await fetch(`${API_BASE}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const zodErr = (data as any)?.error
    if (typeof zodErr === 'object') {
      const first = zodErr?.fieldErrors?.message?.[0]
      throw new Error(first ?? 'Invalid request')
    }
    throw new Error((data as any)?.error ?? 'Request failed')
  }

  return data as { reply: string; sessionId: string }
}

export async function setupChat() {
  const list = el<HTMLDivElement>('#messages')
  const form = el<HTMLFormElement>('#composer')
  const input = el<HTMLInputElement>('#messageInput')
  const sendBtn = el<HTMLButtonElement>('#sendBtn')

  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY) ?? ''

  // load history
  if (sessionId) {
    try {
      const history = await fetchHistory(sessionId)
      history.forEach((m) => renderMessage(list, m))
      scrollToBottom(list)
    } catch {
      // If history fails (e.g., backend down), don’t block.
      setError('Could not load chat history. You can still start a new chat.')
      sessionId = ''
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }

  async function handleSend(textRaw: string) {
    setError(null)

    const text = textRaw.trim()
    if (!text) {
      setError('Please type a message.')
      return
    }
    if (text.length > 4000) {
      setError('Message is too long (max 4000 characters).')
      return
    }

    // optimistic render
    renderMessage(list, { sender: 'user', text })
    scrollToBottom(list)

    sendBtn.disabled = true
    input.disabled = true
    setTyping(true)

    try {
      const { reply, sessionId: newSessionId } = await postMessage(text, sessionId || undefined)
      sessionId = newSessionId
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId)

      renderMessage(list, { sender: 'ai', text: reply })
      scrollToBottom(list)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.')
    } finally {
      setTyping(false)
      sendBtn.disabled = false
      input.disabled = false
      input.focus()
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const text = input.value
    input.value = ''
    void handleSend(text)
  })

  // handy examples
  const examples = document.querySelectorAll<HTMLButtonElement>('[data-example]')
  examples.forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.example ?? ''
      input.focus()
    })
  })
}
