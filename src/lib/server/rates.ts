import { prisma } from './prisma';
import { BASE_CURRENCY, type Rates } from '$lib/money';
import { RATES_URL, parseFrankfurterResponse, resolveRates } from '$lib/rates';

const FETCH_TIMEOUT_MS = 3000;

// Concurrent page loads share one request instead of each calling the rates API.
let inflight: Promise<Rates | null> | null = null;

function fetchLatest(): Promise<Rates | null> {
	inflight ??= fetch(RATES_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		.then(async (response) => (response.ok ? parseFrankfurterResponse(await response.json()) : null))
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

async function save(rates: Rates, fetchedAt: Date): Promise<void> {
	const rows = Object.entries(rates).filter(([currency]) => currency !== BASE_CURRENCY);
	await prisma.$transaction(
		rows.map(([currency, perEur]) =>
			prisma.exchangeRate.upsert({
				where: { currency },
				create: { currency, perEur, fetchedAt },
				update: { perEur, fetchedAt }
			})
		)
	);
}

/** Exchange rates for display conversion, from the database cache and refreshed daily. */
export async function getRates(now = new Date()): Promise<Rates> {
	const rows = await prisma.exchangeRate.findMany();

	const cached =
		rows.length > 0
			? {
					rates: {
						[BASE_CURRENCY]: 1,
						...Object.fromEntries(rows.map((row) => [row.currency, row.perEur]))
					},
					// The oldest row decides staleness, so a partial refresh doesn't hide old data.
					fetchedAt: new Date(Math.min(...rows.map((row) => row.fetchedAt.getTime())))
				}
			: null;

	return resolveRates({ cached, now, fetchLatest, save });
}
