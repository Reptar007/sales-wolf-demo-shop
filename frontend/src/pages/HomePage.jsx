import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import NightScene, { HowlingWolf } from '../components/brand/NightScene.jsx';
import { useApi } from '../hooks/useApi.js';
import { productImage } from '../lib/format.js';

const HERO_STICKERS = [
  { slug: 'lone-wolf-tent', className: 'hero__sticker--a' },
  { slug: 'howl-hoodie', className: 'hero__sticker--b' },
  { slug: 'camp-lantern', className: 'hero__sticker--c' },
];

const PERKS = [
  ['🚚', 'Free shipping over $75', 'Standard shipping is on us for bigger hauls.'],
  ['🌙', 'Restocked nightly', 'The whole store resets at midnight. Seriously.'],
  ['🐺', 'Pack-tested', 'Every flow here is covered by end-to-end tests.'],
];

function PromoStrip() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="promo-strip" aria-label="Current offer">
      <p className="promo-strip__text">
        <span className="promo-strip__big">20% off</span> your whole order with code
      </p>
      <button
        type="button"
        className="promo-strip__code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText('WOLF10');
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
      >
        WOLF10 <span className="promo-strip__hint">{copied ? 'Copied!' : 'Copy'}</span>
      </button>
    </section>
  );
}

export default function HomePage() {
  const featured = useApi('/products?sort=featured');
  const categories = useApi('/categories');

  return (
    <div className="home">
      <section className="hero">
        <NightScene />
        <div className="hero__copy">
          <p className="hero__eyebrow">✦ New moon collection</p>
          <h1>
            Gear for every <span className="hero__highlight">howl&#8209;worthy</span> adventure.
          </h1>
          <p className="hero__lede">
            Trail-tested apparel, camp kitchen essentials, and gadgets that survive the wild.
          </p>
          <div className="hero__actions">
            <Link className="button button--accent button--large" to="/c/outdoor">
              Shop outdoor
            </Link>
            <Link className="button button--moon button--large" to="/search?q=">
              Browse everything
            </Link>
          </div>
        </div>
        <div className="hero__stickers" aria-hidden="true">
          <HowlingWolf className="hero__wolf" />
          {HERO_STICKERS.map((s) => (
            <img
              key={s.slug}
              className={`hero__sticker ${s.className}`}
              src={productImage(s.slug, 2)}
              alt=""
            />
          ))}
        </div>
      </section>

      <PromoStrip />

      <section aria-labelledby="categories-title">
        <div className="section-head">
          <h2 id="categories-title" className="section-title">
            Shop by category
          </h2>
        </div>
        <ul className="category-grid">
          {(categories.data?.categories ?? []).map((c) => (
            <li key={c.slug}>
              <Link to={`/c/${c.slug}`} className={`category-tile category-tile--${c.slug}`}>
                <img src={`/api/images/categories/${c.slug}.svg`} alt="" />
                <strong>{c.name}</strong>
                <span className="category-tile__desc">{c.description}</span>
                <span className="category-tile__count">{c.productCount} products →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured-title">
        <div className="section-head">
          <h2 id="featured-title" className="section-title">
            Pack favorites
          </h2>
          <Link to="/search?q=" className="section-head__link">
            See all products →
          </Link>
        </div>
        {featured.error && <p className="alert alert--error">{featured.error.message}</p>}
        <div className="product-grid">
          {(featured.data?.items ?? []).slice(0, 8).map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>

      <ul className="perks" aria-label="Why WolfMart">
        {PERKS.map(([icon, title, body]) => (
          <li key={title} className="perk">
            <span className="perk__icon" aria-hidden="true">
              {icon}
            </span>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
