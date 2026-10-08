import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OrderSummary from '../components/OrderSummary.jsx';
import { WolfMark } from '../components/brand/Logo.jsx';
import { useCart } from '../context/CartContext.jsx';
import { money, productImage } from '../lib/format.js';

function CartLine({ item, onError }) {
  const { updateItem, removeItem } = useCart();
  const [busy, setBusy] = useState(false);
  const max = Math.max(item.quantity, Math.min(10, item.variant.stock));

  async function run(action) {
    setBusy(true);
    onError(null);
    try {
      await action();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="cart-line" data-testid="cart-line">
      <Link to={`/p/${item.product.slug}`} className="cart-line__image">
        <img src={productImage(item.product.slug, 1, item.variant.color)} alt="" />
      </Link>
      <div className="cart-line__info">
        <Link to={`/p/${item.product.slug}`} className="cart-line__name">
          {item.product.name}
        </Link>
        <p className="muted">{item.variant.label}</p>
        <p className="muted">{money(item.variant.priceCents)} each</p>
        {!item.inStock && (
          <p className="field__error">
            Only {item.variant.stock} left — lower the quantity to check out.
          </p>
        )}
      </div>
      <label className="quantity">
        <span className="visually-hidden">Quantity for {item.product.name}</span>
        <select
          value={item.quantity}
          disabled={busy}
          onChange={(e) => run(() => updateItem(item.id, Number(e.target.value)))}
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="cart-line__total" data-testid="line-total">
        {money(item.lineTotalCents)}
      </p>
      <button
        type="button"
        className="link-button cart-line__remove"
        disabled={busy}
        onClick={() => run(() => removeItem(item.id))}
        aria-label={`Remove ${item.product.name} from cart`}
      >
        Remove
      </button>
    </li>
  );
}

function PromoForm() {
  const { cart, applyPromo, removePromo } = useCart();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (cart.promo) {
    return (
      <div className="promo promo--applied">
        <p>
          <span className="badge badge--accent">{cart.promo.code}</span> {cart.promo.description}
        </p>
        {cart.promo.problem && <p className="field__error">{cart.promo.problem}</p>}
        <button type="button" className="link-button" onClick={() => removePromo()}>
          Remove code
        </button>
      </div>
    );
  }

  return (
    <form
      className="promo"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await applyPromo(code);
          setCode('');
        } catch (cause) {
          setError(cause.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="promo-code">Promo code</label>
      <div className="promo__row">
        <input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'promo-error' : undefined}
        />
        <button type="submit" className="button button--ghost" disabled={busy || !code.trim()}>
          Apply
        </button>
      </div>
      {error && (
        <p id="promo-error" className="field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default function CartPage() {
  const { cart } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  if (!cart) return <p className="muted">Loading your cart…</p>;

  if (cart.items.length === 0) {
    return (
      <section className="page page--narrow empty-state">
        <WolfMark size={96} className="empty-state__art" />
        <h1>Your cart is empty</h1>
        <p className="muted">Find something worth howling about.</p>
        <Link className="button" to="/">
          Continue shopping
        </Link>
      </section>
    );
  }

  const blocked = cart.items.some((i) => !i.inStock);
  const toFreeShipping =
    cart.freeShippingThresholdCents - (cart.totals.subtotalCents - cart.totals.discountCents);

  return (
    <div className="cart">
      <h1>Your cart</h1>
      <div className="cart__layout">
        <div>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <ul className="cart__lines" aria-label="Cart items">
            {cart.items.map((item) => (
              <CartLine key={item.id} item={item} onError={setError} />
            ))}
          </ul>
          <Link to="/">← Continue shopping</Link>
        </div>
        <OrderSummary totals={cart.totals} promoCode={cart.promo?.code}>
          {toFreeShipping > 0 && (
            <p className="muted summary__note">
              Add {money(toFreeShipping)} more for free standard shipping.
            </p>
          )}
          <PromoForm />
          <button
            type="button"
            className="button button--neon button--block"
            disabled={blocked}
            onClick={() => navigate('/checkout')}
          >
            Checkout
          </button>
        </OrderSummary>
      </div>
    </div>
  );
}
