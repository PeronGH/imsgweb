<script lang="ts">
  import type { ApiMessage } from "../../server/payloads";
  import { bubbleTime } from "../format";
  import { store } from "../store.svelte";

  const {
    message,
    isGroup,
    isLatestOwn = false,
  }: {
    message: ApiMessage;
    isGroup: boolean;
    isLatestOwn?: boolean;
  } = $props();

  // strip attachment (U+FFFC) and app-balloon (U+FFFD) placeholders
  const text = $derived(
    message.text.replaceAll("￼", "").replaceAll("�", "").trim(),
  );
  const status = $derived(
    isLatestOwn ? store.sendStates[message.guid] : undefined,
  );
</script>

<div
  class={`mb-1 flex ${message.is_from_me ? "justify-end" : "justify-start"}`}
>
  <div class="max-w-[70%]">
    {#if isGroup && !message.is_from_me}
      <div class="mb-0.5 ml-2 text-xs text-gray-500">
        {message.sender_name ?? message.sender}
      </div>
    {/if}
    <div
      class={`rounded-2xl px-3 py-1.5 ${
        message.is_from_me
          ? "bg-blue-500 text-white"
          : "bg-gray-200 text-gray-900"
      }`}
      title={bubbleTime(message.created_at)}
    >
      {#if message.reply_to_text}
        <div
          class={`mb-1 border-l-2 pl-2 text-xs ${
            message.is_from_me
              ? "border-blue-200 text-blue-100"
              : "border-gray-400 text-gray-500"
          }`}
        >
          {message.reply_to_text}
        </div>
      {/if}
      {#each message.attachments as attachment (attachment.url)}
        {#if attachment.missing}
          <div class="my-1 rounded bg-black/10 px-2 py-1 text-xs italic">
            attachment not downloaded yet
          </div>
        {:else if attachment.mime_type.startsWith("image/")}
          <img
            src={attachment.url}
            alt={attachment.transfer_name}
            loading="lazy"
            class="my-1 max-h-64 rounded-lg"
          />
        {:else if attachment.mime_type.startsWith("audio/")}
          <audio controls src={attachment.url} class="my-1 max-w-full"></audio>
        {:else if attachment.mime_type.startsWith("video/")}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video controls src={attachment.url} class="my-1 max-h-64 rounded-lg"
          ></video>
        {:else}
          <a
            href={attachment.url}
            download={attachment.transfer_name}
            class="my-1 block text-sm underline"
          >
            {attachment.transfer_name || "attachment"}
          </a>
        {/if}
      {/each}
      {#if text}
        <p class="text-[15px] break-words whitespace-pre-wrap">{text}</p>
      {/if}
    </div>
    {#if message.reactions.length > 0}
      <div
        class={`mt-0.5 flex gap-0.5 text-sm ${message.is_from_me ? "justify-end" : ""}`}
      >
        {#each message.reactions as reaction (reaction.id)}
          <span title={reaction.sender_name ?? reaction.sender}>
            {reaction.emoji}
          </span>
        {/each}
      </div>
    {/if}
    {#if status}
      <div class="mt-0.5 text-right text-[11px] text-gray-400">
        {#if status === "delivered"}
          Delivered
        {:else if status === "failed"}
          <span class="text-red-500">Failed</span>
        {:else if status === "sent"}
          Sent
        {:else}
          Sending…
        {/if}
      </div>
    {/if}
  </div>
</div>
