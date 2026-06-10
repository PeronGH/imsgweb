<script lang="ts">
  import type { ApiChat } from "../../server/payloads";
  import Composer from "./Composer.svelte";
  import MessageList from "./MessageList.svelte";

  const { chat }: { chat: ApiChat } = $props();
</script>

<header class="border-b border-gray-200 px-4 py-3">
  <h2 class="font-semibold">{chat.display_name}</h2>
  {#if chat.is_group}
    <p class="truncate text-xs text-gray-500">{chat.participants.join(", ")}</p>
  {/if}
</header>
{#key chat.id}
  <MessageList chatId={chat.id} isGroup={chat.is_group} />
{/key}
<Composer />
