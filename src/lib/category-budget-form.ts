import { isSupportedCurrency, minorDigits, parseMoneyInput, type Currency } from './money';

export interface CategoryBudgetInput {
	category: string;
	/** Integer minor units of `currency`. */
	budgetMinor: number;
	currency: Currency;
}

export type ParsedCategoryBudget =
	{ error: string; data?: undefined } | { error?: undefined; data: CategoryBudgetInput };

export const MAX_CATEGORY_LENGTH = 100;

const AMOUNT_ERROR = 'Please enter a budget greater than zero, like 50 or 50.50.';

/** Validates the "set category budget" form. Pure, so it can be tested without a database. */
export function parseCategoryBudgetForm(formData: FormData): ParsedCategoryBudget {
	const category = String(formData.get('category') ?? '').trim();
	if (!category) return { error: 'Please choose a category.' };
	if (category.length > MAX_CATEGORY_LENGTH) {
		return { error: `Category can be at most ${MAX_CATEGORY_LENGTH} characters.` };
	}

	const currency = formData.get('currency');
	if (!isSupportedCurrency(currency)) return { error: 'Please choose a supported currency.' };

	const parsed = parseMoneyInput(String(formData.get('amount') ?? ''), currency);
	if ('error' in parsed) {
		if (parsed.error === 'decimals') {
			const digits = minorDigits(currency);
			return {
				error:
					digits === 0
						? `${currency} budgets must be whole numbers.`
						: `${currency} budgets can have at most ${digits} decimal${digits === 1 ? '' : 's'}.`
			};
		}
		if (parsed.error === 'too-large') return { error: 'That budget is too large.' };
		return { error: AMOUNT_ERROR };
	}
	if (parsed.minor <= 0) return { error: AMOUNT_ERROR };

	return { data: { category, budgetMinor: parsed.minor, currency } };
}
