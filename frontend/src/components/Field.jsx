import { useId } from 'react';

/** Labelled input with hint and error wiring, so every form field is reachable by its label. */
export default function Field({ label, hint, error, as = 'input', children, ...inputProps }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const Control = as;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Control
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...inputProps}
      >
        {children}
      </Control>
      {hint && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
