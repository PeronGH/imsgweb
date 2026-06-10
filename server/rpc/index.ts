/**
 * Client for the imsg binary's JSON-RPC mode. Spawns `imsg rpc` (from PATH,
 * pinned in the environment to the `imsg/` submodule version) and speaks
 * NDJSON JSON-RPC 2.0 over its stdio. `call()` is typed end-to-end via the
 * method map in ./types; `watch()` exposes subscriptions as async iterables.
 */
import type {
  ImsgMethod,
  ImsgRpcMethods,
  MessagePayload,
  RpcErrorCode,
  RpcErrorObject,
  RpcId,
  WatchSubscribeParams,
} from "./types";

export * from "./types";

/** A JSON-RPC error response from imsg, thrown by `RpcClient.call()`. */
export class RpcError extends Error {
  override name = "RpcError";
  readonly code: RpcErrorCode;
  /** imsg's fixed per-code label, e.g. "Invalid params". */
  readonly label: string;

  constructor(error: RpcErrorObject) {
    // imsg puts the human-readable detail in `data`, not `message`
    super(error.data ?? error.message);
    this.code = error.code;
    this.label = error.message;
  }
}

/** The `imsg rpc` child exited — in-flight calls and open watches get this. */
export class RpcExitError extends Error {
  override name = "RpcExitError";
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`imsg rpc exited with code ${exitCode}`);
    this.exitCode = exitCode;
  }
}

/**
 * A live watch subscription. Iterate to consume messages:
 *
 *   const watch = await rpc.watch({ since_rowid: cursor });
 *   for await (const message of watch) { … }
 *
 * Single consumer per Watch. Breaking out of the loop (or calling
 * `unsubscribe()`) ends the stream and unsubscribes server-side. If the
 * subscription dies — server-side error or process exit — iteration throws;
 * resubscribe with `since_rowid` set to the last message id you processed.
 */
export interface Watch extends AsyncIterable<MessagePayload, void, void> {
  readonly subscription: number;
  unsubscribe(): Promise<void>;
}

interface WatchController {
  push(message: MessagePayload): void;
  /** Ends iteration: with an error it throws, without it ends cleanly. */
  finish(error?: Error): void;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(reason: Error): void;
}

/** Any single line imsg writes to stdout, before demuxing. */
interface WireMessage {
  id?: RpcId | null;
  method?: string;
  params?: {
    subscription: number;
    message?: MessagePayload;
    error?: { message: string };
  };
  result?: unknown;
  error?: RpcErrorObject;
}

function spawnRpcProcess(cmd: string[]) {
  return Bun.spawn({ cmd, stdin: "pipe", stdout: "pipe", stderr: "inherit" });
}
type RpcProcess = ReturnType<typeof spawnRpcProcess>;

/** Resolved at spawn time so IMSGWEB_RPC_CMD can be set after import. */
function defaultCmd(): string[] {
  const override = process.env["IMSGWEB_RPC_CMD"]?.trim();
  return override ? override.split(/\s+/) : ["imsg", "rpc"];
}

/** The params argument is optional only when every param is optional. */
type CallArgs<M extends ImsgMethod> =
  Record<never, never> extends ImsgRpcMethods[M]["params"]
    ? [params?: ImsgRpcMethods[M]["params"]]
    : [params: ImsgRpcMethods[M]["params"]];

export class RpcClient {
  readonly #cmd: string[] | null;
  #proc: RpcProcess | null = null;
  #stopping = false;
  #nextId = 1;
  readonly #pending = new Map<RpcId, PendingCall>();
  readonly #watches = new Map<number, WatchController>();

  /** @param cmd Override the spawned command (default: `imsg rpc` from
   *  PATH, or IMSGWEB_RPC_CMD when set). */
  constructor(cmd?: string[]) {
    this.#cmd = cmd ?? null;
  }

  /** Spawn the child now; otherwise it starts lazily on the first call. */
  start(): void {
    this.#ensureProcess();
  }

  /** Close the child's stdin and wait for it to exit. Open watches end
   *  cleanly; in-flight calls reject. */
  async stop(): Promise<void> {
    const proc = this.#proc;
    if (!proc) return;
    this.#stopping = true;
    proc.stdin.end();
    await proc.exited;
  }

  call<M extends ImsgMethod>(
    method: M,
    ...args: CallArgs<M>
  ): Promise<ImsgRpcMethods[M]["result"]> {
    const proc = this.#ensureProcess();
    const id = this.#nextId++;
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: args[0] ?? {},
    });
    proc.stdin.write(request + "\n");
    proc.stdin.flush();
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  async watch(params: WatchSubscribeParams = {}): Promise<Watch> {
    const { subscription } = await this.call("watch.subscribe", params);

    const queue: MessagePayload[] = [];
    let failure: Error | null = null;
    let done = false;
    let wake: (() => void) | null = null;
    const signal = () => {
      wake?.();
      wake = null;
    };

    this.#watches.set(subscription, {
      push: (message) => {
        queue.push(message);
        signal();
      },
      finish: (error) => {
        failure ??= error ?? null;
        done = true;
        signal();
      },
    });

    const unsubscribe = async (): Promise<void> => {
      done = true;
      signal();
      if (this.#watches.delete(subscription)) {
        await this.call("watch.unsubscribe", { subscription });
      }
    };

    async function* iterate(): AsyncGenerator<MessagePayload, void, void> {
      try {
        for (;;) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          if (failure) throw failure;
          if (done) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        // also reached via break/return in the consumer's for-await
        await unsubscribe();
      }
    }

    return { subscription, unsubscribe, [Symbol.asyncIterator]: iterate };
  }

  #ensureProcess(): RpcProcess {
    if (!this.#proc) {
      this.#stopping = false;
      this.#proc = spawnRpcProcess(this.#cmd ?? defaultCmd());
      void this.#pump(this.#proc);
    }
    return this.#proc;
  }

  async #pump(proc: RpcProcess): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.#dispatch(line);
        // Yield so a continuation this line resolved (e.g. watch()
        // registering its controller after the subscribe response) runs
        // before the next line — a notification can share a chunk with
        // the response to its own subscribe.
        await Promise.resolve();
      }
    }
    const code = await proc.exited;
    if (this.#proc === proc) this.#proc = null;
    const reason = new RpcExitError(code);
    for (const pending of this.#pending.values()) pending.reject(reason);
    this.#pending.clear();
    for (const watch of this.#watches.values()) {
      watch.finish(this.#stopping ? undefined : reason);
    }
    this.#watches.clear();
  }

  #dispatch(line: string): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(line) as WireMessage;
    } catch {
      console.error("imsg rpc: skipping unparseable line:", line);
      return;
    }
    if (typeof msg.method === "string") {
      this.#dispatchNotification(msg);
      return;
    }
    if (msg.id !== undefined && msg.id !== null) {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      if (msg.error) pending.reject(new RpcError(msg.error));
      else pending.resolve(msg.result);
      return;
    }
    if (msg.error) {
      // id:null — a parse/invalid-request error not attributable to a call
      console.error("imsg rpc:", msg.error.message, msg.error.data ?? "");
    }
  }

  #dispatchNotification(msg: WireMessage): void {
    const params = msg.params;
    if (!params) return;
    const watch = this.#watches.get(params.subscription);
    if (!watch) return;
    if (msg.method === "message" && params.message) {
      watch.push(params.message);
    } else if (msg.method === "error") {
      // the subscription is dead server-side; the consumer must resubscribe
      this.#watches.delete(params.subscription);
      watch.finish(
        new Error(params.error?.message ?? "watch subscription failed"),
      );
    }
  }
}

/**
 * Shared client for the app — lazily spawns `imsg rpc` (from PATH) on first
 * use. Set IMSGWEB_RPC_CMD to override the command (split on spaces), e.g.
 * IMSGWEB_RPC_CMD="bun server/rpc/mock.ts" to run against the fixture mock
 * without the imsg binary or Full Disk Access.
 */
export const rpc = new RpcClient();
