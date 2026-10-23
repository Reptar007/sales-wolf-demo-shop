import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Elements, ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../lib/api.js';
import { getStripe } from '../lib/stripe.js';

/** Only the two phone wallets, never Link or Amazon Pay. */
const ELEMENT_OPTIONS = {
  paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', amazonPay: 'never' },
  emailRequired: true,
  shippingAddressRequired: true,
  allowedShippingCountries: ['US', 'CA', 'GB'],
  buttonHeight: 48,
  layout: { maxColumns: 1, overflow: 'never' },
};

/**
 * The PaymentIntent's amount always comes from the server (POST
 * /payments/intent). The browser only sends what it's buying.
 */
function WalletButtons({ purchase, quote, onError, onStateChange }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { refresh } = useCart();
  const [amount, setAmount] = useState(quote.quotes.standard.totalCents);

  async function confirm(event) {
    onError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      onError(submitError.message);
      return;
    }

    let intent;
    try {
      intent = await api('/payments/intent', {
        method: 'POST',
        body: {
          ...purchase,
          shippingMethod: event.shippingRate?.id ?? 'standard',
          email: event.billingDetails?.email,
          shipping: event.shippingAddress,
        },
      });
    } catch (cause) {
      event.paymentFailed({ reason: 'fail' });
      onError(
        cause.status >= 500 ? 'Something went wrong. You have not been charged.' : cause.message,
      );
      return;
    }
    if (intent.amountCents !== amount) {
      event.paymentFailed({ reason: 'fail' });
      onError('Prices changed while you were paying. You have not been charged; please try again.');
      return;
    }

    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret: intent.clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message ?? 'Your payment didn’t go through.');
      return;
    }

    try {
      const { order } = await api('/payments/complete', {
        method: 'POST',
        body: { paymentIntentId: intent.paymentIntentId },
      });
      await refresh().catch(() => {});
      navigate(`/order/${order.number}`);
    } catch (cause) {
      onError(cause.message);
    }
  }

  return (
    <ExpressCheckoutElement
      options={ELEMENT_OPTIONS}
      onReady={({ availablePaymentMethods }) =>
        onStateChange(availablePaymentMethods ? 'ready' : 'unavailable')
      }
      onLoadError={() => onStateChange('error')}
      onClick={(event) => {
        onError(null);
        setAmount(quote.quotes.standard.totalCents);
        elements.update({ amount: quote.quotes.standard.totalCents });
        event.resolve({ lineItems: quote.lineItems, shippingRates: quote.shippingRates });
      }}
      onShippingRateChange={(event) => {
        const next = quote.quotes[event.shippingRate.id]?.totalCents;
        if (next === undefined) return event.reject();
        setAmount(next);
        elements.update({ amount: next });
        event.resolve({ lineItems: quote.lineItems });
      }}
      onCancel={() => onError('Payment cancelled. You have not been charged.')}
      onConfirm={confirm}
    />
  );
}

/**
 * Apple Pay / Google Pay via Stripe's Express Checkout Element.
 *
 * `purchase` is { source: 'cart' } or { source: 'buy-now', variantId, quantity }.
 * `quoteKey` changes whenever what's being bought changes, to re-price; pass
 * `purchase` as null while nothing is buyable (no size chosen, out of stock).
 *
 * Wallet buttons only render on a domain registered with Stripe, so on
 * localhost and review apps the container is there but empty. Its
 * data-wallet-state says why: loading, disabled (no Stripe keys), not-buyable,
 * unavailable (no wallet on this device/domain), ready, or error.
 */
export default function WalletCheckout({ purchase, quoteKey, testId }) {
  const [stripe, setStripe] = useState(undefined);
  const [quote, setQuote] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    getStripe().then((s) => {
      if (!live) return;
      setStripe(s);
      if (!s) setState('disabled');
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!stripe) return undefined;
    if (!purchase) {
      setQuote(null);
      setState('not-buyable');
      return undefined;
    }
    const controller = new AbortController();
    api('/payments/quote', { method: 'POST', body: purchase, signal: controller.signal })
      .then(({ quote: next }) => setQuote(next))
      .catch((cause) => {
        if (cause.name === 'AbortError') return;
        setQuote(null);
        setState('not-buyable');
      });
    return () => controller.abort();
    // quoteKey stands in for `purchase`, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, quoteKey]);

  const options = useMemo(
    () =>
      quote && {
        mode: 'payment',
        amount: quote.quotes.standard.totalCents,
        currency: quote.currency,
        appearance: { theme: 'stripe' },
      },
    [quote],
  );

  return (
    <div className="wallet" data-testid={testId} data-wallet-state={state}>
      {stripe && options && (
        <Elements stripe={stripe} options={options}>
          <WalletButtons
            purchase={purchase}
            quote={quote}
            onError={setError}
            onStateChange={setState}
          />
        </Elements>
      )}
      {error && (
        <p className="alert alert--error wallet__error" role="alert" data-testid="wallet-error">
          {error}
        </p>
      )}
    </div>
  );
}
