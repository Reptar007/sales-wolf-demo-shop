import { useApi } from '../hooks/useApi.js';

/**
 * The P0 boundary panel, kept: opening /status answers "is the deploy healthy
 * and still isolated?" without a shell.
 */
export default function StatusPage() {
  const { data: health, error } = useApi('/health');
  const egress = health?.egressAllowlist;

  return (
    <section className="page page--narrow">
      <h1>System status</h1>
      <p className="muted">The isolation boundary, reported live by the server.</p>
      <div className="panel">
        {error && <p className="status-row status-row--bad">Unreachable — {error.message}</p>}
        {!error && !health && <p className="status-row">Checking…</p>}
        {health && (
          <ul className="status-list">
            <li className="status-row status-row--ok">Server healthy ({health.environment})</li>
            <li className={`status-row status-row--${egress?.installed ? 'ok' : 'bad'}`}>
              Egress allowlist {egress?.installed ? 'active' : 'NOT ACTIVE'}
            </li>
            <li className="status-row">
              Outbound permitted: <code>{egress?.allowedHosts?.join(', ') || 'none'}</code>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
