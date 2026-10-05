import { Link } from 'react-router-dom';

export default function NotFoundPage({ title = 'Page not found', message }) {
  return (
    <section className="page page--narrow empty-state">
      <h1>{title}</h1>
      <p className="muted">
        {message ?? 'That page wandered off. Let’s get you back on the trail.'}
      </p>
      <Link className="button" to="/">
        Back to the shop
      </Link>
    </section>
  );
}
