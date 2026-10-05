import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

const CATEGORIES = [
  ['apparel', 'Apparel'],
  ['footwear', 'Footwear'],
  ['outdoor', 'Outdoor'],
  ['home', 'Home'],
  ['kitchen', 'Kitchen'],
  ['tech', 'Tech'],
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
      <input
        id="site-search"
        type="search"
        placeholder="Search WolfMart"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
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
        Demo store — products, orders, and payments are fictional.
      </div>
      <header className="header">
        <div className="header__inner">
          <Link to="/" className="logo" aria-label="WolfMart home">
            <span className="logo__mark" aria-hidden="true">
              ◐
            </span>
            WolfMart
          </Link>
          <SearchForm />
          <nav className="header__actions" aria-label="Account">
            {user ? (
              <NavLink to="/account">Hi, {user.name.split(' ')[0]}</NavLink>
            ) : (
              <NavLink to="/signin">Sign in</NavLink>
            )}
            <NavLink
              to="/cart"
              className="cart-link"
              aria-label={`Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            >
              Cart
              <span className="cart-link__count" data-testid="cart-count">
                {itemCount}
              </span>
            </NavLink>
          </nav>
        </div>
        <nav className="categories" aria-label="Categories">
          {CATEGORIES.map(([slug, name]) => (
            <NavLink key={slug} to={`/c/${slug}`}>
              {name}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <p>
            WolfMart is a fictional store built for QA Wolf demos. Nothing here ships, and no real
            payment is ever taken.
          </p>
          <nav aria-label="Footer">
            <Link to="/demo-inbox">Demo inbox</Link>
            <Link to="/status">System status</Link>
          </nav>
        </div>
      </footer>
      {/* Site-wide widgets (live chat P3, AI assistant P4) mount below. */}
    </div>
  );
}
