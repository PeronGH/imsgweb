<script lang="ts">
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Info from "@lucide/svelte/icons/info";
  import X from "@lucide/svelte/icons/x";
  import { fly } from "svelte/transition";
  import { toasts } from "../toast.svelte";

  const KIND_CLASS = {
    info: "bg-gray-800 text-white",
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
  } as const;
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
>
  {#each toasts.items as toast (toast.id)}
    <div
      transition:fly={{ y: 8, duration: 150 }}
      role={toast.kind === "error" ? "alert" : "status"}
      class={`pointer-events-auto flex max-w-md items-center gap-2 rounded-full py-2 pr-2 pl-4 text-sm shadow-lg ${KIND_CLASS[toast.kind]}`}
    >
      {#if toast.kind === "error"}
        <CircleAlert size={16} class="shrink-0" />
      {:else if toast.kind === "success"}
        <CircleCheck size={16} class="shrink-0" />
      {:else}
        <Info size={16} class="shrink-0" />
      {/if}
      <span class="min-w-0">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        class="shrink-0 rounded-full p-1 hover:bg-white/20"
        onclick={() => toasts.dismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  {/each}
</div>
