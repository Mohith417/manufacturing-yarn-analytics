import { useEffect, useState } from "react";
import Icon from "./Icon";

const STEPS = [
  {
    title: "This is YarnLens",
    body: "It reads production, quality and maintenance records from one factory, then points to the machines most likely to break down next.",
    target: null,
  },
  {
    title: "The plant floor",
    body: "Every tile is a machine, grouped by production line. Green means OK, amber means watch, red means check now. Hover a tile for its number.",
    target: "tour-plantfloor",
  },
  {
    title: "Start here",
    body: "The five machines with the highest chance of breakdown today, each with its main reason in plain words.",
    target: "tour-starthere",
  },
  {
    title: "Open a machine",
    body: "Click any tile or row to see why it scored that way, what you could check, and a what-if slider. Ctrl+K jumps to any machine from anywhere.",
    target: "tour-plantfloor",
  },
] as const;

/** The four-step first-visit tour; replayable from the help menu. */
export default function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];

  useEffect(() => {
    if (open) {
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const target = step.target ? document.getElementById(step.target) : null;
    if (!target) {
      return;
    }
    target.classList.add("tour-glow");
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    return () => target.classList.remove("tour-glow");
  }, [open, index, step.target]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const last = index === STEPS.length - 1;

  return (
    <div className="tour" role="dialog" aria-labelledby="tour-title" aria-modal="false">
      <div className="tour__top">
        <span className="tour__count">
          Step {index + 1} of {STEPS.length}
        </span>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close tour">
          <Icon name="close" size={14} />
        </button>
      </div>
      <h2 id="tour-title">{step.title}</h2>
      <p>{step.body}</p>
      <div className="tour__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Skip
        </button>
        <div className="tour__next">
          {index > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setIndex((current) => current - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => (last ? onClose() : setIndex((current) => current + 1))}
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
