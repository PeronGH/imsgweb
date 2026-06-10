<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";
  import { api } from "../api";

  let password = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit() {
    if (submitting || password === "") return;
    submitting = true;
    error = null;
    try {
      const res = await api.auth.$post({ json: { password } });
      if (res.ok) {
        // reload so everything (including the EventSource) restarts
        // with the cookie in place
        location.reload();
        return;
      }
      error =
        res.status === 401 ? "Wrong password" : `Login failed (${res.status})`;
    } catch {
      error = "Login failed — is the server running?";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex h-screen items-center justify-center bg-white text-gray-900">
  <form
    class="flex w-72 flex-col items-center gap-3"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <Lock size={40} strokeWidth={1.25} class="text-gray-300" />
    <p class="text-center text-sm text-gray-500">
      This imsgweb instance is password protected
    </p>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="password"
      bind:value={password}
      autofocus
      placeholder="Password"
      disabled={submitting}
      class="w-full rounded-2xl border border-gray-300 px-3 py-1.5 text-[15px] focus:border-blue-400 focus:outline-none"
    />
    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}
    <button
      type="submit"
      disabled={submitting || password === ""}
      class="w-full rounded-2xl bg-blue-500 py-1.5 text-white disabled:opacity-40"
    >
      Unlock
    </button>
  </form>
</div>
