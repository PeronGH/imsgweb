/**
 * App state: a rune-based singleton store. All server access goes through
 * the typed hc client; all data manipulation goes through web/model.ts.
 */
import { api } from "./api";
import { connectEvents } from "./events";
import { applyReactionEvent, bumpChat, upsertMessage } from "./model";
import { toasts } from "./toast.svelte";
import type { ApiChat, ApiMessage } from "../server/payloads";

/** Extract the API's { error } body, falling back to the HTTP status. */
async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = (await res.json()) as { error?: string };
    if (parsed.error !== undefined) return parsed.error;
  } catch {
    // not a JSON body
  }
  return `${fallback} (${res.status})`;
}

export type SendState = "pending" | "sent" | "delivered" | "read" | "failed";

class Store {
  chats = $state<ApiChat[]>([]);
  selectedChatId = $state<number | null>(null);
  /** Per chat, sorted oldest→newest by id. */
  messages = $state<Record<number, ApiMessage[]>>({});
  /** Per chat: pass back as `before` to page older; null = exhausted. */
  cursors = $state<Record<number, string | null>>({});
  /** Delivery state by message guid, for the status tick. */
  sendStates = $state<Record<string, SendState>>({});
  live = $state(false);
  /** On narrow screens the panes are exclusive: list or conversation. */
  sidebarOpen = $state(true);
  /** Message to emphasize after a quote jump; MessageList scrolls to it. */
  highlightedGuid = $state<string | null>(null);
  #highlightTimer: ReturnType<typeof setTimeout> | null = null;

  selectedChat = $derived(
    this.chats.find((chat) => chat.id === this.selectedChatId),
  );

  async start(): Promise<void> {
    connectEvents({
      onMessage: (message) => this.handleEvent(message),
      onStateChange: (live) => (this.live = live),
    });
    await this.loadChats();
  }

  async loadChats(): Promise<void> {
    try {
      const res = await api.chats.$get({ query: {} });
      if (!res.ok) {
        toasts.error(await errorDetail(res, "Failed to load chats"));
        return;
      }
      this.chats = (await res.json()).chats;
    } catch {
      toasts.error("Failed to load chats — is the server running?");
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /** Jump to a quoted message if it's in the loaded history. */
  jumpToMessage(chatId: number, guid: string): void {
    const loaded = (this.messages[chatId] ?? []).some((m) => m.guid === guid);
    if (!loaded) {
      toasts.info("That message isn't loaded yet — scroll up to load more");
      return;
    }
    if (this.#highlightTimer !== null) clearTimeout(this.#highlightTimer);
    this.highlightedGuid = guid;
    this.#highlightTimer = setTimeout(() => {
      this.highlightedGuid = null;
      this.#highlightTimer = null;
    }, 1600);
  }

  async select(chatId: number): Promise<void> {
    this.selectedChatId = chatId;
    // narrow screens show one pane at a time — switch to the conversation
    if (!window.matchMedia("(min-width: 768px)").matches) {
      this.sidebarOpen = false;
    }
    if (!(chatId in this.messages)) await this.loadHistory(chatId);
  }

  async loadOlder(chatId: number): Promise<void> {
    const cursor = this.cursors[chatId];
    if (cursor != null) await this.loadHistory(chatId, cursor);
  }

  async loadHistory(chatId: number, before?: string): Promise<void> {
    try {
      const res = await api.chats[":chatId"].messages.$get({
        param: { chatId: String(chatId) },
        query: before === undefined ? {} : { before },
      });
      if (!res.ok) {
        toasts.error(await errorDetail(res, "Failed to load messages"));
        return;
      }
      const { messages, next_before } = await res.json();
      let merged = this.messages[chatId] ?? [];
      for (const message of messages) merged = upsertMessage(merged, message);
      this.messages[chatId] = merged;
      this.cursors[chatId] = next_before;
    } catch {
      toasts.error("Failed to load messages");
    }
  }

  /** Send to the selected chat. The bubble itself arrives via the SSE echo
   *  (no optimistic insert); delivery state is polled into sendStates. */
  async send(input: { text?: string; file?: File }): Promise<boolean> {
    const chat = this.selectedChat;
    if (!chat) return false;
    try {
      const res = await api.messages.$post({
        form: {
          chat_id: String(chat.id),
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.file !== undefined ? { file: input.file } : {}),
        },
      });
      if (!res.ok) {
        toasts.error(await errorDetail(res, "Send failed"));
        return false;
      }
      const result = await res.json();
      if (result.guid !== undefined) void this.trackSendStatus(result.guid);
      return true;
    } catch {
      toasts.error("Send failed");
      return false;
    }
  }

  async trackSendStatus(guid: string): Promise<void> {
    this.sendStates[guid] = "pending";
    // delivery lands in seconds; the read receipt can trail by a while —
    // poll fast first, then slowly, for ~90s total
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const res = await api.messages[":guid"].status.$get({
          param: { guid },
        });
        if (res.ok) {
          const { send_state, status_fields } = await res.json();
          const state: SendState =
            status_fields?.date_read != null ? "read" : send_state;
          this.sendStates[guid] = state;
          if (state === "read" || state === "failed") return;
        }
      } catch {
        // transient — retry on the next tick
      }
      await new Promise((resolve) =>
        setTimeout(resolve, attempt < 5 ? 1500 : 5000),
      );
    }
  }

  handleEvent(message: ApiMessage): void {
    if (message.is_reaction) {
      const list = this.messages[message.chat_id];
      if (list) {
        this.messages[message.chat_id] = applyReactionEvent(list, message);
      }
      return;
    }
    const list = this.messages[message.chat_id];
    if (list) this.messages[message.chat_id] = upsertMessage(list, message);
    const bumped = bumpChat(this.chats, message);
    if (bumped === null) void this.loadChats();
    else this.chats = bumped;
  }
}

export const store = new Store();
