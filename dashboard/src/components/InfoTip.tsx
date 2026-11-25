import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

/**
 * A dotted-underlined term with a one-sentence definition on hover and focus.
 * The bubble is mounted at the document level while open: inside a scrolling
 * table it would otherwise be clipped, and while closed it would count towards
 * the table's scroll width. The definition is repeated in aria-label so it is
 * available without a pointer.
 */
export default function InfoTip({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(
    null,
  );

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 268);
    // Flip below the button when there is no room above it.
    const below = rect.top < 140;
    setPos({ top: below ? rect.bottom + 8 : rect.top - 8, left, below });
  };

  const hide = () => setPos(null);

  return (
    <span className="tip">
      <button
        ref={btnRef}
        type="button"
        className="tip__btn"
        aria-describedby={id}
        aria-label={`${term}: ${definition}`}
        onMouseEnter={show}
        onFocus={show}
        onMouseLeave={hide}
        onBlur={hide}
      >
        <span className="tip__term">{term}</span>
        <Icon name="info" size={12} />
      </button>
      {pos
        ? createPortal(
            <span
              className={`tip__bubble tip__bubble--portal${pos.below ? " is-below" : ""}`}
              role="tooltip"
              id={id}
              style={{
                top: pos.top,
                left: pos.left,
                transform: pos.below ? undefined : "translateY(-100%)",
              }}
            >
              {definition}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
