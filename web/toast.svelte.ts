/**
 * App-wide transient notifications. Use `toasts.error(...)` (or info /
 * success) from anywhere; web/components/Toasts.svelte renders the stack.
 */
export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION_MS: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  error: 6000,
};

class ToastStore {
  items = $state<Toast[]>([]);
  #nextId = 1;
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(kind: ToastKind, message: string): void {
    // refresh an identical visible toast instead of stacking duplicates
    const existing = this.items.find(
      (toast) => toast.kind === kind && toast.message === message,
    );
    if (existing) {
      this.#schedule(existing.id, DURATION_MS[kind]);
      return;
    }
    const id = this.#nextId++;
    this.items = [...this.items, { id, kind, message }];
    this.#schedule(id, DURATION_MS[kind]);
  }

  info(message: string): void {
    this.show("info", message);
  }
  success(message: string): void {
    this.show("success", message);
  }
  error(message: string): void {
    this.show("error", message);
  }

  dismiss(id: number): void {
    const timer = this.#timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.#timers.delete(id);
    this.items = this.items.filter((toast) => toast.id !== id);
  }

  #schedule(id: number, ms: number): void {
    const previous = this.#timers.get(id);
    if (previous !== undefined) clearTimeout(previous);
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), ms),
    );
  }
}

export const toasts = new ToastStore();
