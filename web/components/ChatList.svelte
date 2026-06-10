<script lang="ts">
  import { shortTime } from "../format";
  import { store } from "../store.svelte";
</script>

<nav class="flex-1 overflow-y-auto">
  {#each store.chats as chat (chat.id)}
    <button
      type="button"
      onclick={() => void store.select(chat.id)}
      class={`flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
        chat.id === store.selectedChatId ? "bg-blue-50" : ""
      }`}
    >
      <span class="flex items-baseline justify-between gap-2">
        <span class="truncate font-medium">
          {chat.contact_name ?? chat.name}
          {#if chat.is_group}
            <span
              class="ml-1 rounded bg-gray-200 px-1 text-[10px] uppercase text-gray-600"
            >
              group
            </span>
          {/if}
        </span>
        <span class="shrink-0 text-xs text-gray-400">
          {shortTime(chat.last_message_at)}
        </span>
      </span>
      {#if chat.last_message}
        <span class="truncate text-sm text-gray-500">
          {chat.last_message.is_from_me ? "You: " : ""}{chat.last_message
            .text || "(attachment)"}
        </span>
      {/if}
    </button>
  {/each}
  {#if store.chats.length === 0}
    <p class="px-4 py-6 text-center text-sm text-gray-400">No chats yet</p>
  {/if}
</nav>
