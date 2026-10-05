import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

/** Only same-site paths, so ?next= can't bounce a shopper to another site. */
function safeNext(params) {
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

function useSubmit(action) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action(new FormData(event.currentTarget));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return { submit, error, busy };
}

const fieldError = (error, field) => (error?.details?.field === field ? error.message : undefined);

function FormError({ error, fields = [] }) {
  if (!error || fields.includes(error.details?.field)) return null;
  return (
    <p className="alert alert--error" role="alert">
      {error.message}
    </p>
  );
}

export function SignInPage() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params);
  const { submit, error, busy } = useSubmit(async (form) => {
    await signIn(form.get('email'), form.get('password'));
    navigate(next, { replace: true });
  });

  if (user && !busy) return <Navigate to={next} replace />;

  return (
    <section className="page page--narrow auth">
      <h1>Sign in</h1>
      <form className="form panel" onSubmit={submit} noValidate>
        <FormError error={error} fields={['email']} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={fieldError(error, 'email')}
        />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth__links">
          <Link to="/forgot-password">Forgot your password?</Link>
          <span>
            New here? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </span>
        </p>
      </form>
      <aside className="panel credential-card" aria-label="Demo accounts">
        <h2>Demo account</h2>
        <p>
          <code>demo@wolfmart.test</code> / <code>WolfMart!2026</code>
        </p>
        <p className="muted">Has saved addresses and order history. Data resets nightly.</p>
      </aside>
    </section>
  );
}

export function SignUpPage() {
  const { user, signUp } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params);
  const { submit, error, busy } = useSubmit(async (form) => {
    await signUp({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    });
    navigate(next, { replace: true });
  });

  if (user && !busy) return <Navigate to={next} replace />;

  return (
    <section className="page page--narrow auth">
      <h1>Create an account</h1>
      <form className="form panel" onSubmit={submit} noValidate>
        <FormError error={error} fields={['name', 'email', 'password']} />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          error={fieldError(error, 'name')}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={
            fieldError(error, 'email') ??
            (error?.code === 'EMAIL_TAKEN' ? error.message : undefined)
          }
          hint="Use a made-up address — this is a demo store, and accounts reset nightly."
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={fieldError(error, 'password')}
        />
        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth__links">
          <span>
            Already have an account?{' '}
            <Link to={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </span>
        </p>
      </form>
    </section>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(null);
  const { submit, error, busy } = useSubmit(async (form) => {
    const result = await api('/auth/password/forgot', {
      method: 'POST',
      body: { email: form.get('email') },
    });
    setSent(result.message);
  });

  return (
    <section className="page page--narrow auth">
      <h1>Reset your password</h1>
      {sent ? (
        <div className="panel">
          <p className="alert alert--success" role="status">
            {sent}
          </p>
          <p>
            This demo has no real email. Open the <Link to="/demo-inbox">demo inbox</Link> to find
            your reset link.
          </p>
        </div>
      ) : (
        <form className="form panel" onSubmit={submit} noValidate>
          <p className="muted">Enter your account email and we’ll send a reset link.</p>
          <FormError error={error} fields={['email']} />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={fieldError(error, 'email')}
          />
          <button className="button button--block" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="auth__links">
            <Link to="/signin">Back to sign in</Link>
          </p>
        </form>
      )}
    </section>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [mismatch, setMismatch] = useState(false);
  const { submit, error, busy } = useSubmit(async (form) => {
    if (form.get('password') !== form.get('confirm')) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const { user } = await api('/auth/password/reset', {
      method: 'POST',
      body: { token, password: form.get('password') },
    });
    setUser(user);
    navigate('/account?reset=1', { replace: true });
  });

  if (!token) {
    return (
      <section className="page page--narrow auth">
        <h1>Reset link missing</h1>
        <p>
          Open the link from your <Link to="/demo-inbox">demo inbox</Link>, or{' '}
          <Link to="/forgot-password">request a new one</Link>.
        </p>
      </section>
    );
  }

  return (
    <section className="page page--narrow auth">
      <h1>Choose a new password</h1>
      <form className="form panel" onSubmit={submit} noValidate>
        <FormError error={error} fields={['password']} />
        {error?.code === 'RESET_INVALID' && (
          <p>
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        )}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={fieldError(error, 'password')}
        />
        <Field
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          error={mismatch ? 'Passwords don’t match.' : undefined}
        />
        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </section>
  );
}
