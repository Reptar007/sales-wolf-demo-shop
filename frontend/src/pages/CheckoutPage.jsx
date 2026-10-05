import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import OrderSummary from '../components/OrderSummary.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';
import { DEMO_CARD_HINT, formatCardNumber, tokenizeDemoCard } from '../lib/demoCards.js';
import { money } from '../lib/format.js';

const STEPS = ['Contact', 'Shipping', 'Payment', 'Review'];
const DRAFT_KEY = 'wolfmart.checkout';

const SHIPPING_METHODS = [
  { id: 'standard', label: 'Standard', detail: '5–7 business days' },
  { id: 'express', label: 'Express', detail: '2 business days', priceCents: 1499 },
];

const EMPTY_ADDRESS = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'US',
};

/** The draft survives a reload. Card details never go in it — only the token. */
function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode: the checkout still works, it just won't survive a reload.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function required(values, fields) {
  const errors = {};
  for (const [field, label] of fields)
    if (!String(values[field] ?? '').trim()) errors[field] = `${label} is required.`;
  return errors;
}

function Stepper({ step }) {
  return (
    <ol className="stepper" aria-label="Checkout progress">
      {STEPS.map((label, index) => (
        <li
          key={label}
          className={index === step ? 'is-current' : index < step ? 'is-done' : ''}
          aria-current={index === step ? 'step' : undefined}
        >
          <span className="stepper__number">{index + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}

function ContactStep({ draft, onNext }) {
  const [email, setEmail] = useState(draft.email ?? '');
  const [error, setError] = useState(null);
  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          return setError('Enter a valid email address.');
        onNext({ email: email.trim() });
      }}
    >
      <h2>Contact</h2>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        hint="Your confirmation lands in the demo inbox."
      />
      <div className="form__actions">
        <button className="button" type="submit">
          Continue to shipping
        </button>
      </div>
    </form>
  );
}

function ShippingStep({ draft, user, onBack, onNext, onMethodChange }) {
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS, ...draft.shipping });
  const [method, setMethod] = useState(draft.shippingMethod ?? 'standard');
  const [saveAddress, setSaveAddress] = useState(false);
  const [errors, setErrors] = useState({});
  const saved = useApi(user ? '/account/addresses' : null);
  const addresses = saved.data?.addresses ?? [];

  const set = (field) => (e) => setAddress((a) => ({ ...a, [field]: e.target.value }));

  function pick(id) {
    const a = addresses.find((x) => x.id === id);
    if (a) {
      const { name, line1, line2, city, region, postalCode, country } = a;
      setAddress({ name, line1, line2: line2 ?? '', city, region, postalCode, country });
    }
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = required(address, [
          ['name', 'Full name'],
          ['line1', 'Address'],
          ['city', 'City'],
          ['region', 'State'],
          ['postalCode', 'ZIP code'],
          ['country', 'Country'],
        ]);
        setErrors(found);
        if (Object.keys(found).length === 0)
          onNext({ shipping: address, shippingMethod: method, saveAddress });
      }}
    >
      <h2>Shipping</h2>
      {addresses.length > 0 && (
        <Field
          label="Use a saved address"
          as="select"
          defaultValue=""
          onChange={(e) => pick(e.target.value)}
        >
          <option value="" disabled>
            Choose a saved address
          </option>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} — {a.line1}, {a.city}
            </option>
          ))}
        </Field>
      )}
      <Field
        label="Full name"
        autoComplete="name"
        value={address.name}
        onChange={set('name')}
        error={errors.name}
      />
      <Field
        label="Address"
        autoComplete="address-line1"
        value={address.line1}
        onChange={set('line1')}
        error={errors.line1}
      />
      <Field
        label="Apartment, suite, etc. (optional)"
        autoComplete="address-line2"
        value={address.line2}
        onChange={set('line2')}
      />
      <div className="form__row">
        <Field
          label="City"
          autoComplete="address-level2"
          value={address.city}
          onChange={set('city')}
          error={errors.city}
        />
        <Field
          label="State"
          autoComplete="address-level1"
          value={address.region}
          onChange={set('region')}
          error={errors.region}
        />
        <Field
          label="ZIP code"
          autoComplete="postal-code"
          value={address.postalCode}
          onChange={set('postalCode')}
          error={errors.postalCode}
        />
      </div>
      <Field
        label="Country"
        as="select"
        value={address.country}
        onChange={set('country')}
        error={errors.country}
      >
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="GB">United Kingdom</option>
      </Field>

      <fieldset className="field">
        <legend>Shipping method</legend>
        {SHIPPING_METHODS.map((m) => (
          <label key={m.id} className="choice">
            <input
              type="radio"
              name="shippingMethod"
              value={m.id}
              checked={method === m.id}
              onChange={() => {
                setMethod(m.id);
                onMethodChange(m.id);
              }}
            />
            <span>
              <strong>{m.label}</strong> <span className="muted">{m.detail}</span>
            </span>
            <span className="choice__price">
              {m.priceCents ? money(m.priceCents) : 'Free over $75'}
            </span>
          </label>
        ))}
      </fieldset>

      {user && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={saveAddress}
            onChange={(e) => setSaveAddress(e.target.checked)}
          />
          Save this address to my account
        </label>
      )}

      <div className="form__actions">
        <button className="button button--ghost" type="button" onClick={onBack}>
          Back
        </button>
        <button className="button" type="submit">
          Continue to payment
        </button>
      </div>
    </form>
  );
}

function PaymentStep({ draft, onBack, onNext }) {
  const [values, setValues] = useState({
    name: draft.shipping?.name ?? '',
    number: '',
    expiry: '',
    cvc: '',
  });
  const [errors, setErrors] = useState({});
  const set =
    (field, transform = (v) => v) =>
    (e) =>
      setValues((v) => ({ ...v, [field]: transform(e.target.value) }));

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = tokenizeDemoCard(values);
        setErrors(result.errors ?? {});
        if (result.card) onNext({ payment: result.card });
      }}
    >
      <h2>Payment</h2>
      <p className="alert alert--info">
        Demo store — no real payment is taken. {DEMO_CARD_HINT} Use 4000 0000 0000 0002 to see a
        decline.
      </p>
      <Field
        label="Name on card"
        autoComplete="off"
        value={values.name}
        onChange={set('name')}
        error={errors.name}
      />
      <Field
        label="Card number"
        inputMode="numeric"
        autoComplete="off"
        placeholder="4242 4242 4242 4242"
        value={values.number}
        onChange={set('number', formatCardNumber)}
        error={errors.number}
      />
      <div className="form__row">
        <Field
          label="Expiry (MM/YY)"
          inputMode="numeric"
          autoComplete="off"
          placeholder="12/30"
          value={values.expiry}
          onChange={set('expiry')}
          error={errors.expiry}
        />
        <Field
          label="CVC"
          inputMode="numeric"
          autoComplete="off"
          placeholder="123"
          value={values.cvc}
          onChange={set('cvc')}
          error={errors.cvc}
        />
      </div>
      <div className="form__actions">
        <button className="button button--ghost" type="button" onClick={onBack}>
          Back
        </button>
        <button className="button" type="submit">
          Review order
        </button>
      </div>
    </form>
  );
}

function ReviewStep({ draft, cart, onEdit, onPlaced }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useCart();
  const method = SHIPPING_METHODS.find((m) => m.id === draft.shippingMethod);
  const s = draft.shipping;

  async function placeOrder() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api('/checkout', {
        method: 'POST',
        body: {
          email: draft.email,
          shipping: s,
          shippingMethod: draft.shippingMethod,
          paymentToken: draft.payment.token,
          saveAddress: draft.saveAddress,
        },
      });
      onPlaced(order);
    } catch (cause) {
      setError(cause);
      if (cause.code === 'OUT_OF_STOCK') refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-step">
      <h2>Review your order</h2>
      {error && (
        <div className="alert alert--error" role="alert">
          {error.status >= 500
            ? 'Something went wrong placing your order. You have not been charged.'
            : error.message}
          {error.code === 'OUT_OF_STOCK' && (
            <>
              {' '}
              <Link to="/cart">Return to cart</Link>
            </>
          )}
        </div>
      )}
      <dl className="review-step__details">
        <div>
          <dt>Contact</dt>
          <dd>{draft.email}</dd>
          <dd>
            <button type="button" className="link-button" onClick={() => onEdit(0)}>
              Edit contact
            </button>
          </dd>
        </div>
        <div>
          <dt>Ship to</dt>
          <dd>
            {s.name}
            <br />
            {s.line1}
            {s.line2 && `, ${s.line2}`}
            <br />
            {s.city}, {s.region} {s.postalCode}, {s.country}
          </dd>
          <dd>
            {method?.label} — {method?.detail}
          </dd>
          <dd>
            <button type="button" className="link-button" onClick={() => onEdit(1)}>
              Edit shipping
            </button>
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {draft.payment.brand} ending in {draft.payment.last4}
          </dd>
          <dd>
            <button type="button" className="link-button" onClick={() => onEdit(2)}>
              Edit payment
            </button>
          </dd>
        </div>
      </dl>
      <ul className="review-step__items" aria-label="Items">
        {cart.items.map((item) => (
          <li key={item.id}>
            <span>
              {item.quantity} × {item.product.name}{' '}
              <span className="muted">({item.variant.label})</span>
            </span>
            <span>{money(item.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <div className="form__actions">
        <button className="button button--ghost" type="button" onClick={() => onEdit(2)}>
          Back
        </button>
        <button
          className="button button--accent"
          type="button"
          onClick={placeOrder}
          disabled={busy}
        >
          {busy ? 'Placing order…' : 'Place order'}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const { user } = useAuth();
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => ({ email: user?.email, ...loadDraft(), payment: null }));
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const quote = useApi(`/cart?shippingMethod=${draft.shippingMethod ?? 'standard'}`);

  useEffect(() => {
    saveDraft({ ...draft, payment: null });
  }, [draft]);

  if (!cart) return <p className="muted">Loading…</p>;
  if (cart.items.length === 0 && !placing) return <Navigate to="/cart" replace />;

  const advance = (changes) => {
    setDraft((d) => ({ ...d, ...changes }));
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  // A step can only be shown once everything before it is filled in.
  const safeStep = step >= 3 && !draft.payment ? 2 : step >= 1 && !draft.email ? 0 : step;

  return (
    <div className="checkout">
      <h1>Checkout</h1>
      <Stepper step={safeStep} />
      <div className="checkout__layout">
        <section className="panel">
          {safeStep === 0 && <ContactStep draft={draft} onNext={advance} />}
          {safeStep === 1 && (
            <ShippingStep
              draft={draft}
              user={user}
              onBack={back}
              onNext={advance}
              onMethodChange={(shippingMethod) => setDraft((d) => ({ ...d, shippingMethod }))}
            />
          )}
          {safeStep === 2 && <PaymentStep draft={draft} onBack={back} onNext={advance} />}
          {safeStep === 3 && (
            <ReviewStep
              draft={draft}
              cart={cart}
              onEdit={setStep}
              onPlaced={async (order) => {
                setPlacing(true);
                clearDraft();
                await refresh();
                navigate(`/order/${order.number}`, { replace: true });
              }}
            />
          )}
        </section>
        {quote.data && (
          <OrderSummary totals={quote.data.cart.totals} promoCode={quote.data.cart.promo?.code} />
        )}
      </div>
    </div>
  );
}
