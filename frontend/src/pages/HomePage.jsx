import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useApi } from '../hooks/useApi.js';

export default function HomePage() {
  const featured = useApi('/products?sort=featured');
  const categories = useApi('/categories');

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__copy">
          <p className="hero__eyebrow">New season · Built for the pack</p>
          <h1>Gear for every howl-worthy adventure.</h1>
          <p className="hero__lede">
            Trail-tested apparel, camp kitchen essentials, and gadgets that survive the wild. Free
            standard shipping on orders over $75.
          </p>
          <div className="hero__actions">
            <Link className="button button--accent" to="/c/outdoor">
              Shop outdoor
            </Link>
            <Link className="button button--ghost" to="/search?q=">
              Browse everything
            </Link>
          </div>
        </div>
        <img className="hero__art" src="/api/images/products/lone-wolf-tent/1.svg" alt="" />
      </section>

      <section aria-labelledby="categories-title">
        <h2 id="categories-title" className="section-title">
          Shop by category
        </h2>
        <ul className="category-grid">
          {(categories.data?.categories ?? []).map((c) => (
            <li key={c.slug}>
              <Link to={`/c/${c.slug}`} className="category-tile">
                <strong>{c.name}</strong>
                <span className="muted">{c.description}</span>
                <span className="category-tile__count">{c.productCount} products</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured-title">
        <h2 id="featured-title" className="section-title">
          Featured
        </h2>
        {featured.error && <p className="alert alert--error">{featured.error.message}</p>}
        <div className="product-grid">
          {(featured.data?.items ?? []).slice(0, 8).map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
