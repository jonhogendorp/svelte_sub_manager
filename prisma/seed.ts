import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

/** Renewal dates are stored at UTC midnight; seed relative to today so the
 * urgency and reminder states are actually visible after seeding. */
function daysFromToday(days: number): Date {
	const today = new Date();
	return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days));
}

async function main() {
	await prisma.subscription.createMany({
		data: [
			{
				name: 'Netflix',
				priceMinor: 1599,
				category: 'Entertainment',
				billingCycle: 'monthly',
				renewalDate: daysFromToday(2)
			},
			{
				name: 'Spotify',
				priceMinor: 999,
				category: 'Music',
				billingCycle: 'monthly',
				renewalDate: daysFromToday(6)
			},
			{
				name: 'GitHub Copilot',
				priceMinor: 10000,
				category: 'Software',
				billingCycle: 'yearly',
				renewalDate: daysFromToday(21)
			}
		]
	});
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
