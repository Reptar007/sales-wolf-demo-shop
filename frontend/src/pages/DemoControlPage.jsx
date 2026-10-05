import { useCallback, useEffect, useRef, useState } from 'react';
import StaffGate from '../components/StaffGate.jsx';
import { api } from '../lib/api.js';

/**
 * The SE's switchboard (plan §6.4). Used live on calls, so every action is one
 * click, toggles respond instantly (optimistic, rolled back on error), and the
 * copy under each flag is written to be read aloud.
 */
export default function DemoControlPage() {
  return (
    <StaffGate title="Demo control">
      <DemoControl />
    </StaffGate>
  );
}

const errorText = (error, what) =>
  error.status === 401
    ? 'Your session expired. Reload the page and unlock again.'
    : `${what} didn’t go through: ${error.message}`;

function DemoControl() {
  const [flags, setFlags] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: 'success' | 'error', text }
  const [resettingFlags, setResettingFlags] = useState(false);
  // Per-flag request counter: only the latest click on a flag may settle it.
  const latest = useRef({});

  const load = useCallback(() => {
    setLoadError(null);
    api('/demo-control/flags')
      .then((data) => setFlags(data.flags))
      .catch(setLoadError);
  }, []);

  useEffect(load, [load]);

  // Another SE may have flipped something from their own tab; coming back to
  // this one should never show a stale board.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const fail = (error, what) => setNotice({ tone: 'error', text: errorText(error, what) });

  async function toggle(flag) {
    const enabled = !flag.enabled;
    const seq = (latest.current[flag.key] ?? 0) + 1;
    latest.current[flag.key] = seq;
    const setEnabled = (value) =>
      setFlags((all) => all.map((f) => (f.key === flag.key ? { ...f, enabled: value } : f)));

    setEnabled(enabled);
    setNotice(null);
    try {
      const { flag: saved } = await api(`/demo-control/flags/${flag.key}`, {
        method: 'PATCH',
        body: { enabled },
      });
      if (latest.current[flag.key] === seq) setEnabled(saved.enabled);
    } catch (error) {
      if (latest.current[flag.key] === seq) setEnabled(flag.enabled);
      fail(error, `Turning “${flag.label}” ${enabled ? 'on' : 'off'}`);
    }
  }

  async function resetAll() {
    const before = flags;
    for (const key of Object.keys(latest.current)) latest.current[key] += 1;
    setFlags((all) => all.map((f) => ({ ...f, enabled: false })));
    setResettingFlags(true);
    setNotice(null);
    try {
      const data = await api('/demo-control/flags/reset', { method: 'POST', body: {} });
      setFlags(data.flags);
      setNotice({ tone: 'success', text: 'All flags off. The store is healthy.' });
    } catch (error) {
      setFlags(before);
      fail(error, 'Reset all');
    } finally {
      setResettingFlags(false);
    }
  }

  async function lock() {
    try {
      await api('/staff/session', { method: 'DELETE' });
    } finally {
      // The gate re-checks the session on load and shows the passphrase form.
      window.location.reload();
    }
  }

  const activeCount = flags?.filter((f) => f.enabled).length ?? 0;

  return (
    <div className="demo-control">
      <header className="demo-control__bar">
        <div className="demo-control__title">
          <h1>Demo control</h1>
          <p className="muted">Break WolfMart on purpose. Changes apply on the next request.</p>
        </div>
        <div className="demo-control__tools">
          <a className="button button--ghost button--small" href="/" target="_blank" rel="noopener">
            Open storefront ↗
          </a>
          <button className="button button--ghost button--small" type="button" onClick={lock}>
            Lock
          </button>
        </div>
      </header>

      <section
        className={`demo-control__summary${activeCount ? ' demo-control__summary--active' : ''}`}
        aria-label="Active flags"
      >
        <p className="demo-control__count" data-testid="active-flag-count">
          {flags === null ? (
            'Loading flags…'
          ) : activeCount === 0 ? (
            <>
              <span className="demo-control__dot demo-control__dot--ok" aria-hidden="true" />
              All clear — no flags on
            </>
          ) : (
            <>
              <span className="demo-control__dot demo-control__dot--on" aria-hidden="true" />
              {activeCount} {activeCount === 1 ? 'flag' : 'flags'} on
            </>
          )}
        </p>
        <button
          className="button button--accent demo-control__reset"
          type="button"
          onClick={resetAll}
          disabled={!flags || resettingFlags}
        >
          {resettingFlags ? 'Resetting…' : 'Reset all'}
        </button>
      </section>

      <div aria-live="polite" className="demo-control__notice">
        {notice && (
          <p
            className={`alert alert--${notice.tone}`}
            role={notice.tone === 'error' ? 'alert' : undefined}
          >
            {notice.text}
          </p>
        )}
      </div>

      {loadError && (
        <div className="alert alert--error" role="alert">
          Couldn’t load the flags: {loadError.message}{' '}
          <button className="link-button" type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {flags && (
        <ul className="flag-list">
          {flags.map((flag) => (
            <FlagCard key={flag.key} flag={flag} onToggle={() => toggle(flag)} />
          ))}
        </ul>
      )}

      <ResetData onDone={setFlags} />
    </div>
  );
}

function FlagCard({ flag, onToggle }) {
  const labelId = `flag-${flag.key}-label`;
  const descId = `flag-${flag.key}-desc`;

  return (
    <li className={`flag-card${flag.enabled ? ' flag-card--on' : ''}`} data-flag={flag.key}>
      <div className="flag-card__head">
        <h2 id={labelId} className="flag-card__label">
          {flag.label}
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={flag.enabled}
          aria-labelledby={labelId}
          aria-describedby={descId}
          className="switch"
          onClick={onToggle}
        >
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="switch__state" aria-hidden="true">
            {flag.enabled ? 'On' : 'Off'}
          </span>
        </button>
      </div>
      <p id={descId} className="flag-card__breaks">
        <span className="flag-card__kicker">What breaks</span>
        {flag.description}
      </p>
      <p className="flag-card__proves">
        <span className="flag-card__kicker">What QA Wolf catches</span>
        {flag.proves}
      </p>
      <p className="flag-card__key">
        <code>{flag.key}</code>
      </p>
    </li>
  );
}

/** Wipes and re-seeds everything, behind an inline confirm: it ends every shopper's session data. */
function ResetData({ onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Shown here, not in the banner up top: the SE is looking at this button.
  const [result, setResult] = useState(null); // { tone, text }
  const confirmRef = useRef(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function reset() {
    setBusy(true);
    setResult(null);
    try {
      const data = await api('/demo-control/reset-data', {
        method: 'POST',
        body: { confirm: 'RESET' },
      });
      onDone(data.flags);
      setConfirming(false);
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setResult({
        tone: 'success',
        text: `Reset at ${at}: ${data.products} products, ${data.users} demo accounts, all flags off.`,
      });
    } catch (error) {
      setResult({ tone: 'error', text: errorText(error, 'Reset demo data') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="danger-zone" aria-labelledby="danger-zone-title">
      <h2 id="danger-zone-title">Reset demo data</h2>
      <p className="muted">
        Re-seeds the catalog, stock, and demo accounts, and turns every flag off. Wipes all orders,
        carts, new accounts, the demo inbox, and chat. Runs automatically every night.
      </p>
      <div aria-live="polite">
        {result && <p className={`alert alert--${result.tone}`}>{result.text}</p>}
      </div>
      {confirming ? (
        <div className="danger-zone__confirm" role="group" aria-label="Confirm reset">
          <p>
            <strong>This signs every shopper out of their cart and order history.</strong> Continue?
          </p>
          <div className="form__actions">
            <button
              ref={confirmRef}
              className="button button--danger-solid"
              type="button"
              onClick={reset}
              disabled={busy}
            >
              {busy ? 'Resetting…' : 'Yes, wipe and re-seed'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="button button--danger" type="button" onClick={() => setConfirming(true)}>
          Reset demo data…
        </button>
      )}
    </section>
  );
}
