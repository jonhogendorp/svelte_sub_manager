const euroFormatter = new Intl.NumberFormat('en-IE', {
	style: 'currency',
	currency: 'EUR'
});

export function formatEuro(value: number): string {
	return euroFormatter.format(value);
}

// Renewal dates are written as `new Date('2026-10-12')`, which parses to UTC
// midnight, so reading them back in UTC is the correct inverse. Switching this
// to local time would shift dates by a day for anyone west of Greenwich.
export function toDateInputValue(date: Date | string): string {
	return new Date(date).toISOString().slice(0, 10);
}

export function formatRenewalDay(date: Date | string): string {
	return new Date(date).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
}
