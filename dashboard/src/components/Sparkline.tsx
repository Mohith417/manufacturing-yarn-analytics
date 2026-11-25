import { useId } from "react";

/**
 * A tiny inline SVG trend line. It renders the values it is given and nothing
 * else: no interpolation beyond the straight segments between points.
 */
export default function Sparkline({
  values,
  height = 46,
  label,
}: {
  values: number[];
  height?: number;
  label: string;
}) {
  const gradientId = useId().replace(/[:]/g, "");
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 100;
  const pad = 4;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a3df2" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#5a3df2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path className="sparkline__line" d={line} vectorEffect="non-scaling-stroke" />
      <circle
        className="sparkline__dot"
        cx={last[0]}
        cy={last[1]}
        r="2.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
