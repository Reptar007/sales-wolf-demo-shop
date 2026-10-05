import { Link } from 'react-router-dom';
import Rating from './Rating.jsx';
import { priceRange, productImage } from '../lib/format.js';

export default function ProductCard({ product }) {
  return (
    <article className="product-card" data-testid="product-card">
      <Link to={`/p/${product.slug}`} className="product-card__link">
        <div className="product-card__image">
          <img src={productImage(product.slug)} alt={product.name} loading="lazy" />
          {!product.inStock && <span className="badge badge--bad">Out of stock</span>}
          {product.inStock && product.lowStock && (
            <span className="badge badge--warn">Low stock</span>
          )}
        </div>
        <h3 className="product-card__name">{product.name}</h3>
      </Link>
      <p className="product-card__price">
        {priceRange(product.priceFromCents, product.priceToCents)}
      </p>
      {product.ratingCount > 0 && (
        <Rating value={product.ratingAverage} count={product.ratingCount} />
      )}
    </article>
  );
}
