import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import Rating from '../components/Rating.jsx';
import WalletCheckout from '../components/WalletCheckout.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import { useApi } from '../hooks/useApi.js';
import { useCart } from '../context/CartContext.jsx';
import { money, productImage, shortDate } from '../lib/format.js';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const sizeRank = (size) => {
  const i = SIZE_ORDER.indexOf(size);
  return i === -1 ? 100 + Number(size) || 999 : i;
};

function stockMessage(variant) {
  if (!variant) return null;
  if (variant.stock <= 0) return { tone: 'bad', text: 'Out of stock' };
  if (variant.stock <= 3) return { tone: 'warn', text: `Only ${variant.stock} left` };
  return { tone: 'ok', text: 'In stock' };
}

function OptionGroup({ legend, options, value, onChange, isAvailable, swatches }) {
  return (
    <fieldset className="options">
      <legend>
        {legend}: <strong>{value ?? 'Choose one'}</strong>
      </legend>
      <div className="options__list">
        {options.map((option) => (
          <label
            key={option}
            className={`option${isAvailable(option) ? '' : ' option--unavailable'}`}
          >
            <input
              type="radio"
              name={legend}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>
              {swatches?.[option] && (
                <i
                  className="option__swatch"
                  style={{ background: swatches[option] }}
                  aria-hidden="true"
                />
              )}
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProductDetail({ product, related }) {
  const { addItem } = useCart();
  const colors = useMemo(
    () => [...new Set(product.variants.map((v) => v.color).filter(Boolean))],
    [product],
  );
  // Variants arrive in SKU order, which would list sizes L, M, S, XL.
  const sizes = useMemo(
    () =>
      [...new Set(product.variants.map((v) => v.size).filter(Boolean))].sort(
        (a, b) => sizeRank(a) - sizeRank(b),
      ),
    [product],
  );

  const firstInStock = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [color, setColor] = useState(colors.length ? firstInStock.color : null);
  const [size, setSize] = useState(sizes.length > 1 ? null : (sizes[0] ?? null));
  const [image, setImage] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const variant = product.variants.find(
    (v) => (colors.length === 0 || v.color === color) && (sizes.length === 0 || v.size === size),
  );
  const stock = stockMessage(variant);
  const maxQuantity = Math.min(10, variant?.stock ?? 0);
  const needsSize = sizes.length > 0 && !size;
  const buyable = Boolean(variant) && !needsSize && variant.stock > 0;

  async function add() {
    setBusy(true);
    setStatus(null);
    try {
      await addItem(variant.id, quantity);
      setStatus({ tone: 'success', text: `Added ${quantity} × ${product.name} to your cart.` });
    } catch (error) {
      setStatus({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> /{' '}
        <Link to={`/c/${product.category.slug}`}>{product.category.name}</Link> /{' '}
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product__layout">
        <div className="gallery">
          <img
            className="gallery__main"
            src={productImage(product.slug, image, color)}
            alt={`${product.name}, image ${image} of ${product.imageCount}`}
          />
          <div className="gallery__thumbs" role="group" aria-label="Product images">
            {Array.from({ length: product.imageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className="gallery__thumb"
                aria-label={`Show image ${n}`}
                aria-pressed={image === n}
                onClick={() => setImage(n)}
              >
                <img src={productImage(product.slug, n, color)} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="product__info">
          <h1>{product.name}</h1>
          {product.ratingCount > 0 ? (
            <a href="#reviews" className="product__rating">
              <Rating value={product.ratingAverage} count={product.ratingCount} />
            </a>
          ) : (
            <p className="muted">No reviews yet</p>
          )}
          <p className="product__price" data-testid="product-price">
            {money(variant?.priceCents ?? product.priceFromCents)}
          </p>
          <p>{product.description}</p>

          {colors.length > 0 && (
            <OptionGroup
              legend="Color"
              swatches={product.swatches}
              options={colors}
              value={color}
              onChange={(c) => {
                setColor(c);
                setQuantity(1);
              }}
              isAvailable={(c) => product.variants.some((v) => v.color === c && v.stock > 0)}
            />
          )}
          {sizes.length > 0 && (
            <OptionGroup
              legend="Size"
              options={sizes}
              value={size}
              onChange={(s) => {
                setSize(s);
                setQuantity(1);
              }}
              isAvailable={(s) =>
                product.variants.some(
                  (v) => v.size === s && (!color || v.color === color) && v.stock > 0,
                )
              }
            />
          )}

          {stock && !needsSize && (
            <p className={`stock stock--${stock.tone}`} data-testid="stock-status">
              {stock.text}
            </p>
          )}

          <div className="product__buy">
            <label className="quantity">
              <span>Quantity</span>
              <select
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!variant || maxQuantity === 0}
              >
                {Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button--accent"
              onClick={add}
              disabled={busy || needsSize || !variant || variant.stock <= 0}
            >
              {needsSize
                ? 'Select a size'
                : variant?.stock <= 0
                  ? 'Out of stock'
                  : busy
                    ? 'Adding…'
                    : 'Add to cart'}
            </button>
          </div>

          <WalletCheckout
            testId="express-checkout-product"
            purchase={buyable ? { source: 'buy-now', variantId: variant.id, quantity } : null}
            quoteKey={buyable ? `${variant.id}:${quantity}` : 'none'}
          />

          {status && (
            <p className={`alert alert--${status.tone}`} role="status">
              {status.text} {status.tone === 'success' && <Link to="/cart">View cart</Link>}
            </p>
          )}
        </div>
      </div>

      <section id="reviews" className="reviews" aria-labelledby="reviews-title">
        <h2 id="reviews-title">Reviews ({product.reviews.length})</h2>
        {product.reviews.length === 0 && (
          <p className="muted">Be the first to review this product.</p>
        )}
        <ul>
          {product.reviews.map((r) => (
            <li key={r.id} className="review">
              <Rating value={r.rating} />
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              <p className="muted">
                {r.author} · {shortDate(r.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <h2 id="related-title" className="section-title">
            You might also like
          </h2>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const { data, error } = useApi(`/products/${encodeURIComponent(slug)}`);

  if (error?.status === 404)
    return <NotFoundPage title="Product not found" message={error.message} />;
  if (error) return <p className="alert alert--error">{error.message}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  // Keyed by slug so moving between products resets the selected options.
  return <ProductDetail key={data.product.slug} product={data.product} related={data.related} />;
}
