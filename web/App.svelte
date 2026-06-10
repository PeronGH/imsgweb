<script lang="ts">
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import PanelLeftClose from "@lucide/svelte/icons/panel-left-close";
  import PanelLeftOpen from "@lucide/svelte/icons/panel-left-open";
  import SquarePen from "@lucide/svelte/icons/square-pen";
  import Wifi from "@lucide/svelte/icons/wifi";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import ChatList from "./components/ChatList.svelte";
  import ComposeNew from "./components/ComposeNew.svelte";
  import Conversation from "./components/Conversation.svelte";
  import Toasts from "./components/Toasts.svelte";
  import { store } from "./store.svelte";

  void store.start();
</script>

<div class="flex h-screen bg-white text-gray-900">
  <aside
    class={`${store.sidebarOpen ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-gray-200 md:w-80`}
  >
    <header
      class="flex items-center justify-between border-b border-gray-200 px-3 py-3"
    >
      <button
        type="button"
        onclick={() => store.toggleSidebar()}
        aria-label="Hide chat list"
        title="Hide chat list"
        class="rounded p-1 text-gray-500 hover:bg-gray-100"
      >
        <PanelLeftClose size={18} />
      </button>
      <span class="flex items-center gap-1">
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
        <button
          type="button"
          onclick={() => store.startCompose()}
          aria-label="New message"
          title="New message"
          class="rounded p-1 text-gray-500 hover:bg-gray-100"
        >
          <SquarePen size={18} />
        </button>
      </span>
    </header>
    <ChatList />
  </aside>
  <section
    class={`${store.sidebarOpen ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col`}
  >
    {#if store.composing}
      <ComposeNew />
    {:else if store.selectedChat}
      <Conversation chat={store.selectedChat} />
    {:else}
      <div
        class="relative flex flex-1 flex-col items-center justify-center gap-3 text-gray-300"
      >
        {#if !store.sidebarOpen}
          <button
            type="button"
            onclick={() => store.toggleSidebar()}
            aria-label="Show chat list"
            title="Show chat list"
            class="absolute top-3 left-3 rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <PanelLeftOpen size={18} />
          </button>
        {/if}
        <MessagesSquare size={48} strokeWidth={1.25} />
        <p class="text-sm text-gray-400">Select a conversation</p>
      </div>
    {/if}
  </section>
  <Toasts />
</div>
