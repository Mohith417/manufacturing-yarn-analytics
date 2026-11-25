import { useEffect, useRef, useState } from "react";
import {
  formatDecimal,
  formatPct,
  type MachineRisk,
  type ModelCoefficients,
  type RiskRule,
} from "../lib/data";
import { contributions, leadCheck, machineSentence } from "../lib/derive";
import { RULE_OF_THUMB_NOTE } from "../lib/copy";
import { riskLevel, scoreRisk } from "../lib/risk";
import ContributionBars from "./ContributionBars";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import RiskBadge from "./RiskBadge";

const SLIDERS = [
  {
    key: "days_since_maintenance",
    label: "Days since maintenance",
    unit: "days",
    step: 1,
    digits: 0,
  },
  { key: "temperature_c", label: "Temperature", unit: "°C", step: 0.5, digits: 1 },
  {
    key: "vibration_mm_s",
    label: "Vibration",
    unit: "mm/s",
    step: 0.1,
    digits: 1,
  },
] as const;

type SliderKey = (typeof SLIDERS)[number]["key"];

function unitLabel(unit: string, value: number): string {
  return unit === "days" && value === 1 ? "day" : unit;
}

/** Slider limits come from the fleet's own exported values, never invented. */
function fleetRange(machines: MachineRisk[], key: SliderKey) {
  const values = machines
    .map((machine) => machine.features[key])
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }
  return {
    min: Math.floor(Math.min(...values)),
    max: Math.ceil(Math.max(...values)),
  };
}

/**
 * The machine detail panel, opened from the plant floor, the table, the quick
 * search or the Start here list. Everything inside is read from
 * machine_risk.json and model_coefficients.json.
 */
export default function MachineDrawer({
  machine,
  machines,
  model,
  modelError,
  rule,
  onClose,
}: {
  machine: MachineRisk | null;
  machines: MachineRisk[];
  model: ModelCoefficients | null;
  modelError: string | null;
  rule: RiskRule | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    setValues(machine ? { ...machine.features } : {});
  }, [machine]);

  useEffect(() => {
    if (!machine) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    // Focus the panel itself so mouse users do not see a focus ring on the
    // close button; the first Tab reaches it as usual.
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [machine, onClose]);

  if (!machine) {
    return null;
  }

  const rank =
    [...machines].sort((a, b) => b.risk_score - a.risk_score).findIndex(
      (row) => row.machine_id === machine.machine_id,
    ) + 1;

  const simulated =
    model && model.features.length > 0
      ? scoreRisk({ ...machine.features, ...values }, model)
      : null;
  const simulatedLevel =
    simulated !== null && rule ? riskLevel(simulated, rule.red_at, rule.amber_at) : null;
  const delta = simulated !== null ? (simulated - machine.risk_score) * 100 : null;
  const unchanged = delta !== null && Math.abs(delta) < 0.5;
  const check = leadCheck(machine);
  const changed = SLIDERS.some(
    (slider) =>
      Math.abs((values[slider.key] ?? machine.features[slider.key]) - machine.features[slider.key]) >
      1e-9,
  );

  return (
    <div className="scrim scrim--drawer" onMouseDown={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={panelRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">
              {machine.line.replace("_", " ")}
              {rank > 0 && ` · #${rank} of ${machines.length}`}
            </p>
            <h2 id="drawer-title">{machine.machine_id}</h2>
          </div>
          <div className="drawer__head-actions">
            <RiskBadge level={machine.risk_level} />
            <button
              type="button"
              className="icon-btn"
              aria-label="Close machine details"
              onClick={onClose}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="drawer__body">
          <p className="drawer__sentence">{machineSentence(machine)}</p>

          <div className="drawer__stats">
            <div className="mini-stat">
              <span>Machine age</span>
              <strong>
                {formatDecimal(machine.age_years, 1)} <small>years</small>
              </strong>
            </div>
            <div className="mini-stat">
              <span>Operating hours</span>
              <strong>
                {formatDecimal(machine.features.operating_hours, 1)} <small>h</small>
              </strong>
            </div>
            <div className="mini-stat">
              <span>Temperature</span>
              <strong>
                {formatDecimal(machine.features.temperature_c, 1)} <small>°C</small>
              </strong>
            </div>
            <div className="mini-stat">
              <span>Vibration</span>
              <strong>
                {formatDecimal(machine.features.vibration_mm_s, 1)} <small>mm/s</small>
              </strong>
            </div>
            <div className="mini-stat">
              <span>Since maintenance</span>
              <strong>
                {formatDecimal(machine.features.days_since_maintenance, 0)}{" "}
                <small>days</small>
              </strong>
            </div>
          </div>

          <section className="drawer__section">
            <h3>Why this score</h3>
            <p className="drawer__hint">
              Each bar is one reading's effect on the chance of breakdown. Long bars
              matter most.
            </p>
            {model ? (
              <ContributionBars items={contributions(machine.features, model)} />
            ) : (
              <EmptyState
                message="The saved model settings are not exported yet, so the drivers cannot be shown."
                detail={modelError ? `model_coefficients.json — ${modelError}` : undefined}
              />
            )}
          </section>

          <section className="drawer__section">
            <h3>Try changes</h3>
            <p className="drawer__hint">
              Move a slider to see a hypothetical score with the saved model. Nothing
              is written back.
            </p>

            {model ? (
              <>
                <div className="sliders">
                  {SLIDERS.map((slider) => {
                    const range = fleetRange(machines, slider.key);
                    const value =
                      values[slider.key] ?? machine.features[slider.key] ?? range.min;
                    return (
                      <div className="slider" key={slider.key}>
                        <div className="slider__head">
                          <label htmlFor={`slider-${slider.key}`}>{slider.label}</label>
                          <output htmlFor={`slider-${slider.key}`}>
                            {value.toFixed(slider.digits)} {unitLabel(slider.unit, value)}
                          </output>
                        </div>
                        <input
                          id={`slider-${slider.key}`}
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={slider.step}
                          value={value}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [slider.key]: Number(event.target.value),
                            }))
                          }
                        />
                        <div className="slider__scale" aria-hidden="true">
                          <span>
                            {range.min} {unitLabel(slider.unit, range.min)}
                          </span>
                          <span>
                            {range.max} {unitLabel(slider.unit, range.max)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="sim">
                  <div className="sim__pair">
                    <div className="sim__col">
                      <span>Now</span>
                      <strong>{formatPct(machine.risk_score, 0)}</strong>
                    </div>
                    <Icon name="arrowRight" />
                    <div className="sim__col">
                      <span>With these changes</span>
                      <strong>{simulated !== null ? formatPct(simulated, 0) : "—"}</strong>
                    </div>
                  </div>
                  <div className="sim__foot">
                    {simulatedLevel && <RiskBadge level={simulatedLevel} size="sm" />}
                    {delta !== null && (
                      <span className={`sim__delta${unchanged ? " sim__delta--flat" : ""}`}>
                        {unchanged
                          ? "No change"
                          : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)} points`}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setValues({ ...machine.features })}
                      disabled={!changed}
                    >
                      <Icon name="reset" size={14} />
                      Reset
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState message="The what-if sliders need the exported model settings." />
            )}
          </section>

          <section className="drawer__section">
            <div className="rule-card">
              <span className="rule-card__tag">Suggested focus</span>
              <p>
                {check ??
                  "Start with a visual check of the machine, then look at the readings above."}
              </p>
              <span className="rule-card__note">{RULE_OF_THUMB_NOTE}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
