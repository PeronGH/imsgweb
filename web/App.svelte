<script lang="ts">
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import Wifi from "@lucide/svelte/icons/wifi";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import ChatList from "./components/ChatList.svelte";
  import Conversation from "./components/Conversation.svelte";
  import { store } from "./store.svelte";

  void store.start();
</script>

<div class="flex h-screen bg-white text-gray-900">
  <aside class="flex w-80 shrink-0 flex-col border-r border-gray-200">
    <header
      class="flex items-center justify-between border-b border-gray-200 px-4 py-3"
    >
      <h1 class="text-lg font-semibold">imsgweb</h1>
      <span
        class={store.live ? "text-green-500" : "text-gray-400"}
        title={store.live ? "Live" : "Connecting…"}
      >
        {#if store.live}
          <Wifi size={16} />
        {:else}
          <WifiOff size={16} />
        {/if}
        <span class="sr-only">{store.live ? "live" : "connecting"}</span>
      </span>
    </header>
    <ChatList />
  </aside>
  <section class="flex min-w-0 flex-1 flex-col">
    {#if store.selectedChat}
      <Conversation chat={store.selectedChat} />
    {:else}
      <div
        class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-300"
      >
        <MessagesSquare size={48} strokeWidth={1.25} />
        <p class="text-sm text-gray-400">Select a conversation</p>
      </div>
    {/if}
  </section>
</div>
