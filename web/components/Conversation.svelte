<script lang="ts">
  import PanelLeftOpen from "@lucide/svelte/icons/panel-left-open";
  import type { ApiChat } from "../../server/payloads";
  import { store } from "../store.svelte";
  import Composer from "./Composer.svelte";
  import MessageList from "./MessageList.svelte";

  const { chat }: { chat: ApiChat } = $props();
</script>

<header class="flex items-center gap-2 border-b border-gray-200 px-3 py-3">
  {#if !store.sidebarOpen}
    <button
      type="button"
      onclick={() => store.toggleSidebar()}
      aria-label="Show chat list"
      title="Show chat list"
      class="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100"
    >
      <PanelLeftOpen size={18} />
    </button>
  {/if}
  <div class="min-w-0">
    <h2 class="truncate font-semibold">{chat.display_name}</h2>
    {#if chat.is_group}
      <p class="truncate text-xs text-gray-500">
        {chat.participants.join(", ")}
      </p>
    {/if}
  </div>
</header>
{#key chat.id}
  <MessageList
    chatId={chat.id}
    isGroup={chat.is_group}
    isSms={chat.service.toLowerCase() !== "imessage"}
  />
{/key}
<Composer />
