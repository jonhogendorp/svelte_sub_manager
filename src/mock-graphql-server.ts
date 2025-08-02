import { ApolloServer, gql } from 'apollo-server';

type Subscription = {
	id: string;
	name: string;
	price: number;
	category: string;
	renewalDate: string;
};

type SubscriptionArgs = { id: string };
type AddSubscriptionArgs = { name: string; price: number; category: string; renewalDate: string };
type EditSubscriptionArgs = {
	id: string;
	name?: string;
	price?: number;
	category?: string;
	renewalDate?: string;
};

// GraphQL schema definition
const typeDefs = gql`
	type Subscription {
		id: ID!
		name: String!
		price: Float!
		category: String!
		renewalDate: String!
	}

	type Query {
		subscriptions: [Subscription!]!
		subscription(id: ID!): Subscription
		categories: [String!]!
	}

	type Mutation {
		addSubscription(
			name: String!
			price: Float!
			category: String!
			renewalDate: String!
		): Subscription!
		editSubscription(
			id: ID!
			name: String
			price: Float
			category: String
			renewalDate: String
		): Subscription!
		deleteSubscription(id: ID!): Boolean!
	}
`;

// Mock data
const subscriptions: Subscription[] = [
	{ id: '1', name: 'Netflix', price: 15.99, category: 'Entertainment', renewalDate: '2025-09-01' },
	{ id: '2', name: 'Spotify', price: 9.99, category: 'Music', renewalDate: '2025-08-15' }
];

// Resolvers
const resolvers = {
	Query: {
		subscriptions: (): Subscription[] => subscriptions,
		subscription: (_: unknown, { id }: SubscriptionArgs): Subscription | undefined =>
			subscriptions.find((sub) => sub.id === id),
		categories: (): string[] => [...new Set(subscriptions.map((sub) => sub.category))]
	},
	Mutation: {
		addSubscription: (
			_: unknown,
			{ name, price, category, renewalDate }: AddSubscriptionArgs
		): Subscription => {
			const newSub: Subscription = { id: String(Date.now()), name, price, category, renewalDate };
			subscriptions.push(newSub);
			return newSub;
		},
		editSubscription: (
			_: unknown,
			{ id, name, price, category, renewalDate }: EditSubscriptionArgs
		): Subscription => {
			const sub = subscriptions.find((sub) => sub.id === id);
			if (!sub) throw new Error('Subscription not found');
			if (name !== undefined) sub.name = name;
			if (price !== undefined) sub.price = price;
			if (category !== undefined) sub.category = category;
			if (renewalDate !== undefined) sub.renewalDate = renewalDate;
			return sub;
		},
		deleteSubscription: (_: unknown, { id }: SubscriptionArgs): boolean => {
			const idx = subscriptions.findIndex((sub) => sub.id === id);
			if (idx === -1) return false;
			subscriptions.splice(idx, 1);
			return true;
		}
	}
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
	console.log(`🚀  Server ready at ${url}`);
});
