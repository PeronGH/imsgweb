<script lang="ts">
  import { tick } from "svelte";
  import { dayLabel, sameDay } from "../format";
  import { store } from "../store.svelte";
  import MessageBubble from "./MessageBubble.svelte";

  const { chatId, isGroup }: { chatId: number; isGroup: boolean } = $props();

  const messages = $derived(store.messages[chatId] ?? []);
  const cursor = $derived(store.cursors[chatId]);
  const latestOwnId = $derived(
    messages.reduce((acc, m) => (m.is_from_me ? m.id : acc), -1),
  );

  let container = $state<HTMLElement | null>(null);
  let nearBottom = true;
  let loadingOlder = $state(false);

  function onScroll() {
    if (!container) return;
    nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      80;
  }

  // Autoscroll on new messages, but only when already reading the bottom.
  $effect(() => {
    void messages.length;
    if (container && nearBottom) container.scrollTop = container.scrollHeight;
  });

  async function loadOlder() {
    if (!container || loadingOlder) return;
    loadingOlder = true;
    const previousHeight = container.scrollHeight;
    try {
      await store.loadOlder(chatId);
      await tick();
      // keep the viewport anchored on the messages it was showing
      container.scrollTop += container.scrollHeight - previousHeight;
    } finally {
      loadingOlder = false;
    }
  }
</script>

<div
  bind:this={container}
  onscroll={onScroll}
  class="flex-1 overflow-y-auto px-4 py-3"
>
  {#if cursor}
    <div class="mb-3 text-center">
      <button
        type="button"
        disabled={loadingOlder}
        onclick={() => void loadOlder()}
        class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-50"
      >
        {loadingOlder ? "Loading…" : "Load older messages"}
      </button>
    </div>
  {/if}
  {#each messages as message, index (message.id)}
    {#if index === 0 || !sameDay(messages[index - 1]?.created_at ?? "", message.created_at)}
      <div class="my-3 text-center text-xs text-gray-400">
        {dayLabel(message.created_at)}
      </div>
    {/if}
    <MessageBubble
      {message}
      {isGroup}
      isLatestOwn={message.id === latestOwnId}
    />
  {/each}
  {#if messages.length === 0}
    <p class="py-8 text-center text-sm text-gray-400">No messages yet</p>
  {/if}
</div>
