/**
 * Fake payment. Only these published test numbers are accepted, and they are
 * swapped for a token here in the browser — no card number, test or real,
 * ever leaves the page.
 */
const CARDS = {
  4242424242424242: { token: 'tok_visa', brand: 'Visa', last4: '4242' },
  5555555555554444: { token: 'tok_mastercard', brand: 'Mastercard', last4: '4444' },
  378282246310005: { token: 'tok_amex', brand: 'Amex', last4: '0005' },
  4000000000000002: { token: 'tok_declined', brand: 'Visa', last4: '0002' },
};

export const DEMO_CARD_HINT = 'Use 4242 4242 4242 4242, any future expiry, any CVC.';

export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

export function formatCardNumber(value) {
  return digitsOnly(value)
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** Returns { card } for a valid demo card, or { errors } keyed by field. */
export function tokenizeDemoCard({ number, expiry, cvc, name }) {
  const errors = {};
  const card = CARDS[digitsOnly(number)];
  if (!card) errors.number = `This demo store only accepts test cards. ${DEMO_CARD_HINT}`;

  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry ?? '').trim());
  if (!match) {
    errors.expiry = 'Enter the expiry as MM/YY.';
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const now = new Date();
    const expired =
      year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
    if (month < 1 || month > 12) errors.expiry = 'Enter a real month.';
    else if (expired) errors.expiry = 'That card has expired.';
  }

  if (!/^\d{3,4}$/.test(digitsOnly(cvc))) errors.cvc = 'Enter the 3 or 4 digit CVC.';
  if (!String(name ?? '').trim()) errors.name = 'Enter the name on the card.';

  return Object.keys(errors).length ? { errors } : { card };
}
