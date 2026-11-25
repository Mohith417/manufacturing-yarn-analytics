import type { ReactNode } from "react";
import InfoTip from "./InfoTip";

/** A compact summary card with one data-derived reading underneath. */
export default function TrendCard({
  label,
  value,
  unit,
  reading,
  tip,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  reading: string;
  /** Optional one-sentence definition shown on the label. */
  tip?: string;
  children?: ReactNode;
}) {
  return (
    <article className="card trend">
      <div className="trend__head">
        {tip ? <InfoTip term={label} definition={tip} /> : <span>{label}</span>}
      </div>
      <div className="trend__value">
        {value} <small>{unit}</small>
      </div>
      {children && <div className="trend__viz">{children}</div>}
      <p className="trend__reading">{reading}</p>
    </article>
  );
}
