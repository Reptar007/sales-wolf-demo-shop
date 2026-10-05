import { Link } from 'react-router-dom';
import OrderSummary from './OrderSummary.jsx';
import { ORDER_STATUS_LABELS, money, productImage, shortDate } from '../lib/format.js';

/** Shared by the confirmation page and account order history. */
export default function OrderDetail({ order }) {
  const s = order.shipping;
  return (
    <div className="order">
      <div className="order__meta">
        <p>
          Order <strong data-testid="order-number">{order.number}</strong> · placed{' '}
          {shortDate(order.createdAt)}
        </p>
        <span className="badge">{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div className="order__layout">
        <div>
          <ul className="order__items" aria-label="Items">
            {order.items.map((item) => (
              <li key={item.id}>
                <img src={productImage(item.productSlug)} alt="" />
                <div>
                  <Link to={`/p/${item.productSlug}`}>{item.productName}</Link>
                  <p className="muted">
                    {item.variantLabel} · Qty {item.quantity}
                  </p>
                </div>
                <span>{money(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="order__addresses">
            <div>
              <h3>Shipping to</h3>
              <p>
                {s.name}
                <br />
                {s.line1}
                {s.line2 && `, ${s.line2}`}
                <br />
                {s.city}, {s.region} {s.postalCode}, {s.country}
              </p>
            </div>
            <div>
              <h3>Payment</h3>
              <p>
                {order.payment.brand} ending in {order.payment.last4}
              </p>
              <h3>Delivery</h3>
              <p>{order.shippingMethod === 'express' ? 'Express' : 'Standard'}</p>
            </div>
          </div>
        </div>
        <OrderSummary totals={order.totals} promoCode={order.promoCode} title="Payment summary" />
      </div>
    </div>
  );
}
