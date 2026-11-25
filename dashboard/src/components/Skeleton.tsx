/** Neutral loading placeholder; used only while a JSON file is in flight. */
export default function Skeleton({
  variant = "lines",
  lines = 3,
}: {
  variant?: "lines" | "chart" | "tiles";
  lines?: number;
}) {
  if (variant === "chart") {
    return <div className="skeleton skeleton--chart" aria-hidden="true" />;
  }
  if (variant === "tiles") {
    return (
      <div className="skeleton-tiles" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, index) => (
          <div className="skeleton skeleton--tile" key={index} />
        ))}
      </div>
    );
  }
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          className="skeleton skeleton--line"
          key={index}
          style={{ width: `${88 - index * 14}%` }}
        />
      ))}
    </div>
  );
}
