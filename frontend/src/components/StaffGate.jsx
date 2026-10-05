import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Wraps SE-only screens (/agent, /demo-control) behind the demo passphrase.
 * Renders children only once the server confirms a staff session.
 */
export default function StaffGate({ title, children }) {
  const [state, setState] = useState({ checked: false, staff: false, configured: true });
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/staff/session')
      .then((s) => setState({ checked: true, ...s }))
      .catch(() => setState({ checked: true, staff: false, configured: true }));
  }, []);

  if (!state.checked) return <p className="staff-gate muted">Checking access…</p>;
  if (state.staff) return children;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api('/staff/session', { method: 'POST', body: { passphrase } });
      setState({ checked: true, ...s });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="staff-gate page--narrow">
      <h1>{title}</h1>
      <p className="muted">For the WolfMart demo team. Enter the demo passphrase to continue.</p>
      {!state.configured && (
        <p className="alert alert--warn">
          No passphrase is configured on this server (DEMO_CONTROL_PASSPHRASE).
        </p>
      )}
      <form className="form panel" onSubmit={submit}>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="staff-passphrase">Passphrase</label>
          <input
            id="staff-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        <button className="button" type="submit" disabled={busy || !passphrase}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </section>
  );
}
