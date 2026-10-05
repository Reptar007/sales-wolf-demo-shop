import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

/**
 * Stands in for email. Shows mail sent from this browser, plus mail to the
 * signed-in account — so an SE can finish a password reset live on a call.
 */
export default function DemoInboxPage() {
  const { data, error, loading, reload } = useApi('/inbox');

  return (
    <section className="page page--medium inbox">
      <header className="page__header">
        <div>
          <h1>Test mailbox</h1>
          <p className="muted">
            WolfMart sends no real email. Password reset links requested from this browser (or for
            your signed-in account) land here instead.
          </p>
        </div>
        <button type="button" className="button button--ghost" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </header>
      {error && <p className="alert alert--error">{error.message}</p>}
      {data?.messages.length === 0 && (
        <div className="panel empty-state">
          <h2>No messages yet</h2>
          <p className="muted">
            Request a <Link to="/forgot-password">password reset</Link> to see one here.
          </p>
        </div>
      )}
      <ul className="inbox__list">
        {(data?.messages ?? []).map((m) => (
          <li key={m.id} className="panel inbox__message" data-testid="inbox-message">
            <p className="inbox__meta muted">
              To {m.to} · {new Date(m.createdAt).toLocaleString()}
            </p>
            <h2>{m.subject}</h2>
            <p>{m.body}</p>
            {m.linkPath && (
              <Link className="button" to={m.linkPath}>
                {m.linkLabel ?? 'Open'}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
