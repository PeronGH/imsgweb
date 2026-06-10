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

<main>
  <h1>imsgweb</h1>
  <form onsubmit={greet}>
    <input bind:value={name} placeholder="Your name" />
    <button type="submit">Greet</button>
  </form>
  {#if greeting}
    <p>{greeting}</p>
  {/if}
</main>

<style>
  main {
    max-width: 40rem;
    margin: 2rem auto;
    font-family: system-ui, sans-serif;
  }
</style>
