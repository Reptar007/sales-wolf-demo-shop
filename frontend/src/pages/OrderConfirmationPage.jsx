import { Link, useParams } from 'react-router-dom';
import Confetti from '../components/Confetti.jsx';
import OrderDetail from '../components/OrderDetail.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function OrderConfirmationPage() {
  const { number } = useParams();
  const { user } = useAuth();
  const { data, error } = useApi(`/orders/${encodeURIComponent(number)}`);

  if (error?.status === 404)
    return <NotFoundPage title="Order not found" message={error.message} />;
  if (error) return <p className="alert alert--error">{error.message}</p>;
  if (!data) return <p className="muted">Loading your order…</p>;

  return (
    <section className="page page--medium confirmation">
      <Confetti />
      <p className="confirmation__check" aria-hidden="true">
        ✓
      </p>
      <p className="confirmation__eyebrow">Awoooo!</p>
      <h1>Thanks for your order!</h1>
      <p className="muted">
        {user ? (
          <>
            It’s saved in your <Link to="/account">order history</Link>.
          </>
        ) : (
          <>
            Keep your order number handy — <Link to="/signin">sign in</Link> next time to keep an
            order history.
          </>
        )}
      </p>
      <OrderDetail order={data.order} />
      <div className="form__actions confirmation__actions">
        <Link className="button" to="/">
          Continue shopping
        </Link>
        {user && (
          <Link className="button button--ghost" to="/account">
            View order history
          </Link>
        )}
      </div>
    </section>
  );
}
