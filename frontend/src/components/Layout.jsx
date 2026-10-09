import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { productImage } from '../lib/format.js';
import Logo, { WolfMark } from './brand/Logo.jsx';
import AssistantWidget from './assistant/AssistantWidget.jsx';
import ChatWidget from './chat/ChatWidget.jsx';

const CATEGORIES = [
  ['apparel', 'Apparel'],
  ['footwear', 'Footwear'],
  ['outdoor', 'Outdoor'],
  ['home', 'Home'],
  ['kitchen', 'Kitchen'],
  ['tech', 'Tech'],
];

const ANNOUNCEMENTS = [
  'Free standard shipping over $75',
  'Code WOLF20 takes 20% off',
  'Demo store — nothing here is real, everything here works',
  'New moon, new gear',
];

function SearchForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  return (
    <form
      className="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor="site-search" className="visually-hidden">
        Search products
      </label>
      <svg className="search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M15.5 15.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <input
        id="site-search"
        type="search"
        placeholder="Search tents, boots, mugs…"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
}

/** Slides in when something lands in the cart, from any page. */
function AddedToast() {
  const { lastAdded, dismissLastAdded } = useCart();

  useEffect(() => {
    if (!lastAdded) return undefined;
    const timer = setTimeout(dismissLastAdded, 3800);
    return () => clearTimeout(timer);
  }, [lastAdded, dismissLastAdded]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {lastAdded && (
        <div className="toast" key={lastAdded.key}>
          <img src={productImage(lastAdded.product.slug, 2, lastAdded.color)} alt="" />
          <div>
            <p className="toast__title">Added to your pack!</p>
            <p className="toast__body">
              {lastAdded.quantity} × {lastAdded.product.name}
              <span className="muted"> · {lastAdded.label}</span>
            </p>
          </div>
          <Link
            className="button button--accent button--small"
            to="/cart"
            onClick={dismissLastAdded}
          >
            View cart
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const { itemCount } = useCart();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-banner" role="note">
        <span className="visually-hidden">
          Demo store — products, orders, and payments are fictional.
        </span>
        <div className="demo-banner__track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <span key={copy} className="demo-banner__set">
              {ANNOUNCEMENTS.map((text) => (
                <span key={text} className="demo-banner__item">
                  <span className="demo-banner__star">✦</span> {text}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <header className="header">
        <div className="header__inner">
          <Link to="/" className="logo" aria-label="WolfMart home">
            <Logo />
          </Link>
          <SearchForm />
          <nav className="header__actions" aria-label="Account">
            {user ? (
              <NavLink to="/account" className="header__link">
                Hi, {user.name.split(' ')[0]}
              </NavLink>
            ) : (
              <NavLink to="/signin" className="header__link">
                Sign in
              </NavLink>
            )}
            <NavLink
              to="/cart"
              className="cart-link"
              aria-label={`Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="cart-link__icon"
              >
                <path
                  d="M3 4h2.5l2.2 11h10.6L21 7.5H7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="19.5" r="1.6" fill="currentColor" />
                <circle cx="17" cy="19.5" r="1.6" fill="currentColor" />
              </svg>
              <span className="cart-link__text">Cart</span>
              {/* Keyed by count so the pop animation replays on every change. */}
              <span key={itemCount} className="cart-link__count" data-testid="cart-count">
                {itemCount}
              </span>
            </NavLink>
          </nav>
        </div>
        <nav className="categories" aria-label="Categories">
          {CATEGORIES.map(([slug, name]) => (
            <NavLink key={slug} to={`/c/${slug}`}>
              <img src={`/api/images/categories/${slug}.svg`} alt="" />
              {name}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <svg
          className="footer__ridge"
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 8 L0 5 L10 2 L18 5 L30 0.5 L42 5 L55 2 L66 5.5 L78 1 L90 4.5 L100 2 L100 8 Z" />
        </svg>
        <div className="footer__inner">
          <div className="footer__brand">
            <WolfMark size={44} />
            <div>
              <p className="footer__name">WolfMart</p>
              <p>
                A fictional store built for QA Wolf demos. Nothing here ships, and no real payment
                is ever taken — but every flow genuinely works.
              </p>
            </div>
          </div>
          <nav aria-label="Footer">
            <Link to="/search?q=">Shop all</Link>
            <Link to="/status">System status</Link>
          </nav>
        </div>
      </footer>

      <AddedToast />
      {/* Site-wide widgets (live chat P3, AI assistant P4) mount below. */}
      <AssistantWidget />
      <ChatWidget />
    </div>
  );
}
