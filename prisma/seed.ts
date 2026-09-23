import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
	await prisma.subscription.createMany({
		data: [
			{
				name: 'Netflix',
				price: 15.99,
				category: 'Entertainment',
				renewalDate: new Date('2025-09-01')
			},
			{
				name: 'Spotify',
				price: 9.99,
				category: 'Music',
				renewalDate: new Date('2025-08-15')
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
