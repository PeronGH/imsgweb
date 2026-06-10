<script lang="ts">
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import Paperclip from "@lucide/svelte/icons/paperclip";
  import X from "@lucide/svelte/icons/x";
  import { store } from "../store.svelte";

  let text = $state("");
  let file = $state<File | null>(null);
  let sending = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  const canSend = $derived(!sending && (text.trim() !== "" || file !== null));

  async function submit() {
    if (!canSend) return;
    sending = true;
    try {
      const trimmed = text.trim();
      const ok = await store.send({
        ...(trimmed !== "" ? { text: trimmed } : {}),
        ...(file !== null ? { file } : {}),
      });
      if (ok) {
        text = "";
        file = null;
        if (fileInput) fileInput.value = "";
      }
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

  function onFileChange(event: Event) {
    file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
  }
</script>

<footer class="border-t border-gray-200 px-4 py-3">
  {#if store.error}
    <p class="mb-2 text-sm text-red-600">{store.error}</p>
  {/if}
  {#if file}
    <p class="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
      <Paperclip size={12} />
      <span class="truncate">{file.name}</span>
      <button
        type="button"
        aria-label="Remove attachment"
        title="Remove attachment"
        class="rounded p-0.5 hover:bg-gray-100"
        onclick={() => {
          file = null;
          if (fileInput) fileInput.value = "";
        }}
      >
        <X size={12} />
      </button>
    </p>
  {/if}
  <form
    class="flex items-end gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <label
      class="cursor-pointer rounded-full p-2 text-gray-500 hover:bg-gray-100"
      title="Attach a file"
      aria-label="Attach a file"
    >
      <Paperclip size={18} />
      <input
        bind:this={fileInput}
        type="file"
        class="hidden"
        onchange={onFileChange}
      />
    </label>
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
