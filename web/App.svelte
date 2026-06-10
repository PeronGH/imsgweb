<script lang="ts">
  import { api } from "./api";

  let name = $state("");
  let greeting = $state("");

  async function greet(event: SubmitEvent) {
    event.preventDefault();
    const res = await api.greet.$post({ json: { name } });
    if (res.ok) {
      greeting = (await res.json()).greeting;
    }
  }
</script>

<main class="mx-auto mt-8 max-w-2xl px-4 font-sans">
  <h1 class="text-2xl font-bold">imsgweb</h1>
  <form onsubmit={greet} class="mt-4 flex gap-2">
    <input
      bind:value={name}
      placeholder="Your name"
      class="rounded border border-gray-300 px-3 py-1.5"
    />
    <button
      type="submit"
      class="rounded bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700"
    >
      Greet
    </button>
  </form>
  {#if greeting}
    <p class="mt-4 text-lg">{greeting}</p>
  {/if}
</main>
