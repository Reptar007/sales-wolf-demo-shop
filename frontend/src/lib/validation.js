const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns the message to show under an email field, or null when the value is
 * fine. Shared so checkout, sign-up and the account page agree on what counts
 * as an email address.
 */
export function emailProblem(value) {
  if (!EMAIL_PATTERN.test((value ?? '').trim())) return 'Enter a valid email address.';
  return null;
}
