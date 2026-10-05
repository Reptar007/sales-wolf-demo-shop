const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const money = (cents) => currency.format((cents ?? 0) / 100);

export const priceRange = (from, to) =>
  from === to ? money(from) : `${money(from)} – ${money(to)}`;

export const shortDate = (value) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Product art; pass a variant colour to see the item painted in it. */
export const productImage = (slug, n = 1, color) =>
  `/api/images/products/${slug}/${n}.svg${color ? `?color=${encodeURIComponent(color)}` : ''}`;

export const ORDER_STATUS_LABELS = {
  PLACED: 'Placed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
