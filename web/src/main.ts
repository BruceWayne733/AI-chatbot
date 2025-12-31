import './style.css'
import { setupChat } from './chat'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="page">
    <header class="header">
      <div class="brand">Spur Shop Support</div>
      <div class="subtitle">Ask about shipping, returns, support hours, etc.</div>
    </header>

    <main class="chat">
      <div class="examples">
        <span class="examples-label">Try:</span>
        <button type="button" class="example" data-example="What's your return policy?">Return policy</button>
        <button type="button" class="example" data-example="Do you ship to USA?">Shipping to USA</button>
        <button type="button" class="example" data-example="What are your support hours?">Support hours</button>
      </div>

      <div id="error" class="error" style="display:none"></div>

      <div id="messages" class="messages" aria-live="polite"></div>

      <div id="typing" class="typing" style="display:none">Agent is typing…</div>

      <form id="composer" class="composer">
        <input
          id="messageInput"
          class="input"
          maxlength="4000"
          placeholder="Type your message…"
          autocomplete="off"
        />
        <button id="sendBtn" class="send" type="submit">Send</button>
      </form>
    </main>
  </div>
`

void setupChat()
