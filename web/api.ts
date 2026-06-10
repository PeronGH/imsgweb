import { hc } from "hono/client";
import type { AppType } from "../server";
import { auth } from "./auth.svelte";

// any 401 anywhere swaps the app for the login screen
const guardedFetch: typeof fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await fetch(input, init);
    if (res.status === 401) auth.required = true;
    return res;
  },
  // Bun's fetch type carries statics; hono's client never calls them
  { preconnect: fetch.preconnect },
);

export const api = hc<AppType>(location.origin, { fetch: guardedFetch }).api;
