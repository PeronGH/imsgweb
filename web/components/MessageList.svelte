<script lang="ts">
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { tick } from "svelte";
  import { dayLabel, sameDay } from "../format";
  import { store } from "../store.svelte";
  import MessageBubble from "./MessageBubble.svelte";

  const { chatId, isGroup }: { chatId: number; isGroup: boolean } = $props();

  const messages = $derived(store.messages[chatId] ?? []);
  const cursor = $derived(store.cursors[chatId]);
  const loading = $derived(store.historyLoading[chatId] === true);
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
    // reaching the top loads the next page automatically
    if (container.scrollTop < 60) void loadOlder();
  }

  // Autoscroll on new messages, but only when already reading the bottom.
  $effect(() => {
    void messages.length;
    if (container && nearBottom) container.scrollTop = container.scrollHeight;
  });

  // Scroll a quote-jump target into view once it's flagged.
  $effect(() => {
    const guid = store.highlightedGuid;
    if (guid === null || !container) return;
    container
      .querySelector(`[data-guid="${CSS.escape(guid)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // When the history is shorter than the viewport there are no scroll
  // events — keep paging until it overflows or the cursor is exhausted.
  $effect(() => {
    void messages.length;
    if (
      container &&
      cursor != null &&
      !loadingOlder &&
      container.scrollHeight <= container.clientHeight
    ) {
      void loadOlder();
    }
  });

  async function loadOlder() {
    if (!container || loadingOlder || cursor == null) return;
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
  {#if loadingOlder}
    <div class="mb-3 flex justify-center text-gray-400">
      <LoaderCircle size={16} class="animate-spin" />
      <span class="sr-only">Loading older messages</span>
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
  {#if loading}
    <div class="flex justify-center py-8 text-gray-400">
      <LoaderCircle size={20} class="animate-spin" />
      <span class="sr-only">Loading messages</span>
    </div>
  {:else if messages.length === 0}
    <p class="py-8 text-center text-sm text-gray-400">No messages yet</p>
  {/if}
</div>
