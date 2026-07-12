// The TRADElogs wordmark. Renders the brand logo image at a given height
// (width auto-scales to the ~3.27:1 aspect). The logo art has a black
// background that blends seamlessly on the app's Core Black surfaces.
export default function Logo({ height = 22, className = '' }: { height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/tradelogs-logo.png"
      alt="TRADElogs"
      style={{ height }}
      className={`w-auto select-none ${className}`}
      draggable={false}
    />
  );
}
