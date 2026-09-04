import { useEffect, useState } from 'react';

/**
 * P0 placeholder.
 *
 * Deliberately not a marketing splash: it reports the isolation boundary's live
 * status, so "is the deploy healthy and still isolated?" is answerable by
 * opening the URL. The storefront replaces this in P1.
 */
export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        return response.json();
      })
      .then(setHealth)
      .catch((cause) => setError(cause.message));
  }, []);

  const egress = health?.egressAllowlist;

  return (
    <main className="boot">
      <p className="boot__eyebrow">QA Wolf demo environment</p>
      <h1 className="boot__title">WolfMart</h1>
      <p className="boot__lede">
        A storefront built to be broken on purpose. Phase P0 — the isolation boundary is in place
        and the storefront lands next.
      </p>

      <section className="boot__panel">
        <h2 className="boot__panel-title">Boundary status</h2>
        {error && <p className="boot__row boot__row--bad">Unreachable — {error}</p>}
        {!error && !health && <p className="boot__row">Checking…</p>}
        {health && (
          <ul className="boot__list">
            <li className="boot__row boot__row--ok">Server healthy ({health.environment})</li>
            <li className={`boot__row boot__row--${egress?.installed ? 'ok' : 'bad'}`}>
              Egress allowlist {egress?.installed ? 'active' : 'NOT ACTIVE'}
            </li>
            <li className="boot__row">
              Outbound permitted: <code>{egress?.allowedHosts?.join(', ') || 'none'}</code>
            </li>
          </ul>
        )}
      </section>
    </main>
  );
}
