// A card-sized "couldn't load" state with an optional retry.
export default function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="x-card x-empty" role="alert">
      <b>Couldn&rsquo;t load this</b>
      <p>{message}</p>
      {onRetry && <button className="x-btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}
