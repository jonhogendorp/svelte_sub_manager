export type ToastKind = 'success' | 'error';

export interface ToastAction {
	label: string;
	onclick: () => void;
}

export interface Toast {
	id: number;
	message: string;
	kind: ToastKind;
	action?: ToastAction;
}

export interface ToastOptions {
	kind?: ToastKind;
	action?: ToastAction;
	/** Milliseconds before it disappears; defaults to 4 s (7 s with an action). */
	duration?: number;
}

class ToastStore {
	items = $state<Toast[]>([]);
	#nextId = 1;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	show(message: string, options: ToastOptions = {}): number {
		const id = this.#nextId++;
		const { kind = 'success', action, duration = action ? 7000 : 4000 } = options;
		this.items.push({ id, message, kind, action });
		this.#timers.set(
			id,
			setTimeout(() => this.dismiss(id), duration)
		);
		return id;
	}

	dismiss(id: number): void {
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
		this.items = this.items.filter((toast) => toast.id !== id);
	}
}

export const toast = new ToastStore();
