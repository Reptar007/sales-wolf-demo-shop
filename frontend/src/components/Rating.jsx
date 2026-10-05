export default function Rating({ value, count }) {
  const rounded = Math.round(value);
  return (
    <p
      className="rating"
      aria-label={`Rated ${value} out of 5${count != null ? `, ${count} reviews` : ''}`}
    >
      <span aria-hidden="true">
        {'★'.repeat(rounded)}
        <span className="rating__empty">{'★'.repeat(5 - rounded)}</span>
      </span>
      {count != null && <span className="rating__count">({count})</span>}
    </p>
  );
}
