import { BASE_CURRENCY, CURRENCIES, type Rates } from './money';

/** Frankfurter serves the ECB reference rates, keyless. */
export const RATES_URL = `https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}`;

export const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Used when there is neither a cache nor a network: everything in euro still adds up. */
export const FALLBACK_RATES: Rates = { [BASE_CURRENCY]: 1 };

/** Keeps only the supported currencies with a usable rate; null when the payload is unusable. */
export function parseFrankfurterResponse(json: unknown): Rates | null {
	if (typeof json !== 'object' || json === null) return null;
	const raw = (json as Record<string, unknown>).rates;
	if (typeof raw !== 'object' || raw === null) return null;

	const rates: Rates = { [BASE_CURRENCY]: 1 };
	for (const currency of CURRENCIES) {
		if (currency === BASE_CURRENCY) continue;
		const value = (raw as Record<string, unknown>)[currency];
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
			rates[currency] = value;
		}
	}
	return Object.keys(rates).length > 1 ? rates : null;
}

export function isStale(fetchedAt: Date, now: Date): boolean {
	return now.getTime() - fetchedAt.getTime() >= RATES_MAX_AGE_MS;
}

export interface RatesDeps {
	now: Date;
	/** Resolves to fresh rates, or null/throws when the source is unavailable. */
	fetchLatest: () => Promise<Rates | null>;
	save: (rates: Rates, fetchedAt: Date) => Promise<void>;
}

/** Fetches and stores fresh rates. Never throws: a failure just means "no new rates". */
export async function refreshRates({ now, fetchLatest, save }: RatesDeps): Promise<Rates | null> {
	try {
		const fresh = await fetchLatest();
		if (!fresh) return null;
		await save(fresh, now);
		return fresh;
	} catch {
		return null;
	}
}

/**
 * Rates for this request without ever making the page wait on the network more than
 * once: a fresh cache is used as is, a stale one is served immediately while a refresh
 * runs in the background, and only an empty cache waits for the fetch.
 */
export async function resolveRates(
	deps: RatesDeps & { cached: { rates: Rates; fetchedAt: Date } | null }
): Promise<Rates> {
	const { cached, now } = deps;

	if (cached && !isStale(cached.fetchedAt, now)) return cached.rates;

	if (cached) {
		void refreshRates(deps);
		return cached.rates;
	}

	return (await refreshRates(deps)) ?? FALLBACK_RATES;
}
