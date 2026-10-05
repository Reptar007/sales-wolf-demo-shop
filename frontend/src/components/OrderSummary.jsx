import { money } from '../lib/format.js';

/**
 * Totals exactly as the server computed them — never re-added in the browser,
 * so a pricing bug on the server shows up here instead of being papered over.
 */
export default function OrderSummary({ totals, promoCode, title = 'Order summary', children }) {
  return (
    <section className="summary panel" aria-labelledby="summary-title">
      <h2 id="summary-title">{title}</h2>
      <dl className="summary__rows">
        <div>
          <dt>Subtotal</dt>
          <dd data-testid="summary-subtotal">{money(totals.subtotalCents)}</dd>
        </div>
        {totals.discountCents > 0 && (
          <div className="summary__discount">
            <dt>Discount{promoCode ? ` (${promoCode})` : ''}</dt>
            <dd data-testid="summary-discount">−{money(totals.discountCents)}</dd>
          </div>
        )}
        <div>
          <dt>Shipping</dt>
          <dd data-testid="summary-shipping">
            {totals.shippingCents === 0 ? 'Free' : money(totals.shippingCents)}
          </dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd data-testid="summary-tax">{money(totals.taxCents)}</dd>
        </div>
        <div className="summary__total">
          <dt>Total</dt>
          <dd data-testid="summary-total">{money(totals.totalCents)}</dd>
        </div>
      </dl>
      {children}
    </section>
  );
}
