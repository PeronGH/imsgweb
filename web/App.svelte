<script lang="ts">
  import { api } from "./api";

  let status = $state("connecting…");
  void api.health.$get().then(async (res) => {
    status = res.ok ? (await res.json()).status : `error ${res.status}`;
  });
</script>

<main class="mx-auto mt-8 max-w-2xl px-4 font-sans">
  <h1 class="text-2xl font-bold">imsgweb</h1>
  <p class="mt-4 text-sm text-gray-500">api: {status}</p>
</main>
