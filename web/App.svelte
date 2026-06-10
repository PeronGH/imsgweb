<script lang="ts">
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
      <span class="flex items-center gap-1.5 text-xs text-gray-500">
        <span
          class={`h-2 w-2 rounded-full ${store.live ? "bg-green-500" : "bg-gray-300"}`}
        ></span>
        {store.live ? "live" : "connecting"}
      </span>
    </header>
    <ChatList />
  </aside>
  <section class="flex min-w-0 flex-1 flex-col">
    {#if store.selectedChat}
      <Conversation chat={store.selectedChat} />
    {:else}
      <div class="flex flex-1 items-center justify-center text-gray-400">
        Select a conversation
      </div>
    {/if}
  </section>
</div>
