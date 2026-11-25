interface TooltipItem {
  name?: string | number;
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  stroke?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  /** Value formatter for the numeric series. */
  format?: (value: number) => string;
  /** Optional formatter for the header label. */
  labelFormat?: (label: string | number) => string;
  /** Optional override for series names, keyed by dataKey. */
  names?: Record<string, string>;
  /** Series whose swatch should render as a dot rather than a bar. */
  dots?: boolean;
}

/** Dark, multi-series tooltip shared by every chart in the dashboard. */
export default function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
  names,
  dots = true,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="tooltip">
      <div className="tooltip__label">
        {labelFormat && label !== undefined ? labelFormat(label) : label}
      </div>
      {payload.map((item, index) => {
        const raw = item.value;
        const numeric = typeof raw === "number" ? raw : Number(raw);
        const text =
          Number.isFinite(numeric) && format ? format(numeric) : String(raw ?? "—");
        const key = String(item.dataKey ?? item.name ?? index);
        const name = names?.[key] ?? item.name ?? key;
        const swatch = item.color ?? item.stroke ?? item.fill ?? "#8b6bff";
        return (
          <div className="tooltip__row" key={`${key}-${index}`}>
            <span className="tooltip__key">
              <span
                className="tooltip__dot"
                style={{ background: swatch, borderRadius: dots ? "50%" : 2 }}
              />
              {name}
            </span>
            <span className="tooltip__val">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
