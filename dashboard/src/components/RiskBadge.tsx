import type { RiskLevel } from "../lib/data";
import { STATUS_LABEL } from "../lib/data";
import Icon, { type IconName } from "./Icon";

const META: Record<RiskLevel, IconName> = {
  red: "alert",
  amber: "clock",
  green: "check",
};

/** Status is never colour alone: every badge carries an icon and a word. */
export default function RiskBadge({
  level,
  label,
  size = "md",
}: {
  level: RiskLevel;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={`risk risk--${level} risk--${size}`}>
      <Icon name={META[level]} size={size === "sm" ? 12 : 14} />
      <span>{label ?? STATUS_LABEL[level]}</span>
    </span>
  );
}
