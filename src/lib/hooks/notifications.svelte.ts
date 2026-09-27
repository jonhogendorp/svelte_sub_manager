const STORAGE_KEY = 'notified-renewals';

function readSentKeys(): Set<string> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return new Set(stored ? (JSON.parse(stored) as string[]) : []);
	} catch {
		return new Set();
	}
}

class NotificationStore {
	permission = $state<NotificationPermission>('default');
	supported = $state(false);
	#sent = new Set<string>();

	constructor() {
		if (typeof window === 'undefined' || !('Notification' in window)) return;

		this.supported = true;
		this.permission = Notification.permission;
		this.#sent = readSentKeys();
	}

	/** Must be called from a user gesture — browsers reject unprompted requests. */
	async request(): Promise<void> {
		if (!this.supported) return;
		this.permission = await Notification.requestPermission();
	}

	/**
	 * Fires once per key. Keys embed the occurrence date, so the same renewal
	 * never re-notifies on reload but the next period's charge does.
	 */
	notify(key: string, title: string, body: string): void {
		if (!this.supported || this.permission !== 'granted' || this.#sent.has(key)) return;

		new Notification(title, { body, tag: key });
		this.#sent.add(key);

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.#sent]));
		} catch {
			// A full or blocked storage quota shouldn't stop the notification itself.
		}
	}
}

export const notifications = new NotificationStore();
