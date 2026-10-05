import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Field from '../components/Field.jsx';
import OrderDetail from '../components/OrderDetail.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';
import { ORDER_STATUS_LABELS, money, shortDate } from '../lib/format.js';

function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState(null);

  return (
    <section className="panel" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus(null);
          try {
            const result = await api('/account/profile', { method: 'PATCH', body: { name } });
            setUser(result.user);
            setStatus({ tone: 'success', text: 'Profile saved.' });
          } catch (error) {
            setStatus({ tone: 'error', text: error.message });
          }
        }}
      >
        {status && (
          <p className={`alert alert--${status.tone}`} role="status">
            {status.text}
          </p>
        )}
        <Field
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <Field label="Email" value={user.email} readOnly disabled />
        <div className="form__actions">
          <button className="button" type="submit" disabled={!name.trim() || name === user.name}>
            Save profile
          </button>
        </div>
      </form>
    </section>
  );
}

function Orders() {
  const { data, error } = useApi('/account/orders');
  return (
    <section className="panel" aria-labelledby="orders-title">
      <h2 id="orders-title">Order history</h2>
      {error && <p className="alert alert--error">{error.message}</p>}
      {data?.orders.length === 0 && (
        <p className="muted">
          No orders yet. <Link to="/">Start shopping</Link>
        </p>
      )}
      {data?.orders.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Date</th>
              <th scope="col">Status</th>
              <th scope="col">Items</th>
              <th scope="col" className="table__num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.number}>
                <td>
                  <Link to={`/account/orders/${o.number}`}>{o.number}</Link>
                </td>
                <td>{shortDate(o.createdAt)}</td>
                <td>
                  <span className="badge">{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                </td>
                <td>{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                <td className="table__num">{money(o.totals.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const EMPTY = {
  label: '',
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'US',
};

function AddressForm({ onSaved, onCancel }) {
  const [values, setValues] = useState(EMPTY);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const err = (field) => (error?.details?.field === field ? error.message : undefined);

  return (
    <form
      className="form address-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const result = await api('/account/addresses', {
            method: 'POST',
            body: { ...values, isDefault },
          });
          onSaved(result.addresses);
        } catch (cause) {
          setError(cause);
        }
      }}
    >
      <h3>New address</h3>
      {error && !error.details?.field && <p className="alert alert--error">{error.message}</p>}
      <Field
        label="Label"
        placeholder="Home, Work…"
        value={values.label}
        onChange={set('label')}
        error={err('label')}
      />
      <Field label="Full name" value={values.name} onChange={set('name')} error={err('name')} />
      <Field label="Address" value={values.line1} onChange={set('line1')} error={err('line1')} />
      <Field
        label="Apartment, suite, etc. (optional)"
        value={values.line2}
        onChange={set('line2')}
      />
      <div className="form__row">
        <Field label="City" value={values.city} onChange={set('city')} error={err('city')} />
        <Field label="State" value={values.region} onChange={set('region')} error={err('region')} />
        <Field
          label="ZIP code"
          value={values.postalCode}
          onChange={set('postalCode')}
          error={err('postalCode')}
        />
      </div>
      <Field label="Country" as="select" value={values.country} onChange={set('country')}>
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="GB">United Kingdom</option>
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Make this my default address
      </label>
      <div className="form__actions">
        <button className="button" type="submit">
          Save address
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Addresses() {
  const { data, error, setData } = useApi('/account/addresses');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function act(path, options) {
    setActionError(null);
    try {
      const result = await api(path, options);
      setData(result);
    } catch (cause) {
      setActionError(cause.message);
    }
  }

  return (
    <section className="panel" aria-labelledby="addresses-title">
      <h2 id="addresses-title">Addresses</h2>
      {(error || actionError) && (
        <p className="alert alert--error">{error?.message ?? actionError}</p>
      )}
      {data?.addresses.length === 0 && !adding && <p className="muted">No saved addresses yet.</p>}
      <ul className="address-list">
        {(data?.addresses ?? []).map((a) => (
          <li key={a.id} className="address-card" data-testid="address-card">
            <p>
              <strong>{a.label}</strong>{' '}
              {a.isDefault && <span className="badge badge--ok">Default</span>}
            </p>
            <p>
              {a.name}
              <br />
              {a.line1}
              {a.line2 && `, ${a.line2}`}
              <br />
              {a.city}, {a.region} {a.postalCode}, {a.country}
            </p>
            <div className="form__actions">
              {!a.isDefault && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    act(`/account/addresses/${a.id}`, {
                      method: 'PUT',
                      body: { ...a, isDefault: true },
                    })
                  }
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className="link-button"
                aria-label={`Delete address ${a.label}`}
                onClick={() => act(`/account/addresses/${a.id}`, { method: 'DELETE' })}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <AddressForm
          onSaved={(addresses) => {
            setData({ addresses });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="button button--ghost" onClick={() => setAdding(true)}>
          Add an address
        </button>
      )}
    </section>
  );
}

export function AccountPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  return (
    <div className="page page--medium account">
      <header className="page__header">
        <div>
          <h1>Your account</h1>
          <p className="muted">Signed in as {user.email}</p>
        </div>
        <button
          type="button"
          className="button button--ghost"
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
        >
          Sign out
        </button>
      </header>
      {params.get('reset') && (
        <p className="alert alert--success" role="status">
          Your password was changed and you’re signed in.
        </p>
      )}
      <Orders />
      <Profile />
      <Addresses />
    </div>
  );
}

export function AccountOrderPage() {
  const { number } = useParams();
  const { data, error } = useApi(`/account/orders/${encodeURIComponent(number)}`);
  if (error?.status === 404)
    return <NotFoundPage title="Order not found" message={error.message} />;
  if (error) return <p className="alert alert--error">{error.message}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="page page--medium">
      <p>
        <Link to="/account">← Back to your account</Link>
      </p>
      <h1>Order {data.order.number}</h1>
      <OrderDetail order={data.order} />
    </section>
  );
}
