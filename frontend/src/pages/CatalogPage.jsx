import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useApi } from '../hooks/useApi.js';
import { toQuery } from '../lib/api.js';

const SORT_OPTIONS = [
  ['featured', 'Featured'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
  ['newest', 'Newest'],
  ['name', 'Name A–Z'],
];

/** One page for /search and /c/:category — the URL holds every filter, so results are linkable. */
export default function CatalogPage({ mode }) {
  const { category: categoryParam } = useParams();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const category = mode === 'category' ? categoryParam : (params.get('category') ?? '');
  const filters = {
    q,
    category,
    color: params.get('color') ?? '',
    size: params.get('size') ?? '',
    inStock: params.get('inStock') === '1' ? '1' : '',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    sort: params.get('sort') ?? 'featured',
    page: params.get('page') ?? '',
  };

  const { data, error, loading } = useApi(`/products${toQuery(filters)}`);
  // Open beside the results on wide screens; a tap-to-open drawer on phones.
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 961px)').matches,
  );

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  const facets = data?.facets;
  const categoryName = facets?.categories.find((c) => c.slug === category)?.name;
  const heading =
    mode === 'category' ? (categoryName ?? 'Category') : q ? `Results for “${q}”` : 'All products';
  const activeFilters = ['color', 'size', 'inStock', 'minPrice', 'maxPrice'].filter(
    (k) => filters[k],
  );

  return (
    <div className="catalog">
      <header className="page__header">
        <div>
          <h1>{heading}</h1>
          <p className="muted" aria-live="polite" data-testid="result-count">
            {loading
              ? 'Searching…'
              : data
                ? `${data.total} ${data.total === 1 ? 'product' : 'products'}`
                : ''}
          </p>
        </div>
        <label className="sort">
          <span>Sort by</span>
          <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="catalog__layout">
        <details
          className="filters-panel"
          open={filtersOpen}
          onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
        >
          <summary className="filters-panel__toggle">
            Filters{activeFilters.length > 0 && ` (${activeFilters.length})`}
          </summary>
          <aside className="filters" aria-label="Filters">
            {mode !== 'category' && facets && (
              <fieldset className="filters__group">
                <legend>Category</legend>
                <label className="checkbox">
                  <input
                    type="radio"
                    name="category"
                    checked={!category}
                    onChange={() => update({ category: '' })}
                  />
                  All
                </label>
                {facets.categories.map((c) => (
                  <label key={c.slug} className="checkbox">
                    <input
                      type="radio"
                      name="category"
                      checked={category === c.slug}
                      onChange={() => update({ category: c.slug })}
                    />
                    {c.name} <span className="muted">({c.count})</span>
                  </label>
                ))}
              </fieldset>
            )}

            <fieldset className="filters__group">
              <legend>Availability</legend>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={filters.inStock === '1'}
                  onChange={(e) => update({ inStock: e.target.checked ? '1' : '' })}
                />
                In stock only
              </label>
            </fieldset>

            <fieldset className="filters__group">
              <legend>Price</legend>
              <form
                key={`${filters.minPrice}-${filters.maxPrice}`}
                className="filters__price"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  update({ minPrice: form.get('minPrice'), maxPrice: form.get('maxPrice') });
                }}
              >
                <label>
                  <span className="visually-hidden">Minimum price</span>
                  <input
                    name="minPrice"
                    type="number"
                    min="0"
                    placeholder="$ min"
                    defaultValue={filters.minPrice}
                  />
                </label>
                <label>
                  <span className="visually-hidden">Maximum price</span>
                  <input
                    name="maxPrice"
                    type="number"
                    min="0"
                    placeholder="$ max"
                    defaultValue={filters.maxPrice}
                  />
                </label>
                <button className="button button--small button--ghost" type="submit">
                  Apply
                </button>
              </form>
            </fieldset>

            {facets?.colors.length > 0 && (
              <fieldset className="filters__group">
                <legend>Color</legend>
                <select
                  aria-label="Color"
                  value={filters.color}
                  onChange={(e) => update({ color: e.target.value })}
                >
                  <option value="">Any color</option>
                  {facets.colors.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </fieldset>
            )}

            {facets?.sizes.length > 0 && (
              <fieldset className="filters__group">
                <legend>Size</legend>
                <select
                  aria-label="Size"
                  value={filters.size}
                  onChange={(e) => update({ size: e.target.value })}
                >
                  <option value="">Any size</option>
                  {facets.sizes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </fieldset>
            )}

            {activeFilters.length > 0 && (
              <button
                type="button"
                className="link-button"
                onClick={() => update(Object.fromEntries(activeFilters.map((k) => [k, ''])))}
              >
                Clear filters
              </button>
            )}
          </aside>
        </details>

        <section className="catalog__results" aria-busy={loading}>
          {error && <p className="alert alert--error">{error.message}</p>}
          {data && data.total === 0 && (
            <div className="empty-state panel">
              <h2>No products found</h2>
              <p className="muted">
                {q ? `Nothing matches “${q}”.` : 'Nothing matches these filters.'} Try a different
                search or clear your filters.
              </p>
              <Link className="button" to="/search?q=">
                See all products
              </Link>
            </div>
          )}
          <div className={`product-grid${loading ? ' product-grid--loading' : ''}`}>
            {(data?.items ?? []).map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
          {data && data.pageCount > 1 && (
            <nav className="pagination" aria-label="Pagination">
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={data.page <= 1}
                onClick={() => update({ page: data.page - 1 })}
              >
                Previous
              </button>
              <span>
                Page {data.page} of {data.pageCount}
              </span>
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={data.page >= data.pageCount}
                onClick={() => update({ page: data.page + 1 })}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
