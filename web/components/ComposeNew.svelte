<script lang="ts">
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import PanelLeftOpen from "@lucide/svelte/icons/panel-left-open";
  import X from "@lucide/svelte/icons/x";
  import { store } from "../store.svelte";

  let to = $state("");
  let text = $state("");
  let sending = $state(false);

  const canSend = $derived(!sending && to.trim() !== "" && text.trim() !== "");

  async function submit() {
    if (!canSend) return;
    sending = true;
    try {
      await store.compose(to.trim(), text.trim());
    } finally {
      sending = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }
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
  <h2 class="flex-1 font-semibold">New message</h2>
  <button
    type="button"
    onclick={() => store.cancelCompose()}
    aria-label="Cancel"
    title="Cancel"
    class="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100"
  >
    <X size={18} />
  </button>
</header>
<div class="border-b border-gray-100 px-4 py-2">
  <label class="flex items-center gap-2 text-sm">
    <span class="text-gray-500">To:</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={to}
      autofocus
      placeholder="phone number or email"
      class="flex-1 py-1 focus:outline-none"
    />
  </label>
</div>
<div class="flex-1"></div>
<footer class="border-t border-gray-200 px-4 py-3">
  <form
    class="flex items-end gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <textarea
      bind:value={text}
      onkeydown={onKeydown}
      rows="1"
      placeholder="iMessage"
      disabled={sending}
      class="max-h-32 flex-1 resize-none rounded-2xl border border-gray-300 px-3 py-1.5 text-[15px] focus:border-blue-400 focus:outline-none"
    ></textarea>
    <button
      type="submit"
      disabled={!canSend}
      aria-label="Send"
      title="Send"
      class="rounded-full bg-blue-500 p-2 text-white disabled:opacity-40"
    >
      <ArrowUp size={18} />
    </button>
  </form>
</footer>
