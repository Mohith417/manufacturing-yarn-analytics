import { useEffect, useMemo, useRef, useState } from "react";
import type { MachineRisk } from "../lib/data";
import { PAGES, type PageId } from "../lib/nav";
import Icon from "./Icon";

interface PaletteRow {
  kind: "page" | "machine";
  id: string;
  label: string;
  meta: string;
}

/**
 * Ctrl/Cmd+K quick search over the five pages and every machine. Keyboard:
 * arrows move, Enter opens, Escape closes.
 */
export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onOpenMachine,
  machines,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onOpenMachine: (id: string) => void;
  machines: MachineRisk[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const rows = useMemo<PaletteRow[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages: PaletteRow[] = PAGES.filter(
      (page) =>
        needle === "" ||
        page.label.toLowerCase().includes(needle) ||
        page.blurb.toLowerCase().includes(needle),
    ).map((page) => ({
      kind: "page",
      id: page.id,
      label: page.label,
      meta: page.blurb,
    }));

    const machineRows: PaletteRow[] = [...machines]
      .sort((a, b) => b.risk_score - a.risk_score)
      .filter(
        (machine) =>
          needle === "" ||
          machine.machine_id.toLowerCase().includes(needle) ||
          machine.line.toLowerCase().replace("_", " ").includes(needle),
      )
      .slice(0, 8)
      .map((machine) => ({
        kind: "machine",
        id: machine.machine_id,
        label: machine.machine_id,
        meta: `${machine.line.replace("_", " ")} · ${Math.round(machine.risk_score * 100)}% chance of breakdown`,
      }));

    return [...pages, ...machineRows];
  }, [machines, query]);

  useEffect(() => {
    if (active >= rows.length) {
      setActive(0);
    }
  }, [active, rows.length]);

  if (!open) {
    return null;
  }

  function choose(row: PaletteRow | undefined) {
    if (!row) {
      return;
    }
    if (row.kind === "page") {
      onNavigate(row.id as PageId);
    } else {
      onOpenMachine(row.id);
    }
    onClose();
  }

  const pageCount = rows.filter((row) => row.kind === "page").length;

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") {
            return;
          }
          const nodes = [
            inputRef.current,
            ...Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(".palette__option"),
            ),
          ].filter((node): node is HTMLElement => node !== null);
          if (nodes.length === 0) {
            return;
          }
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="palette__field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            id="palette-input"
            type="text"
            className="palette__input"
            placeholder="Search a machine or a page…"
            value={query}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[active] ? `palette-${rows[active].kind}-${rows[active].id}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => (rows.length === 0 ? 0 : (current + 1) % rows.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) =>
                  rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(rows[active]);
              }
            }}
          />
          <kbd className="palette__kbd">Esc</kbd>
        </div>

        <ul className="palette__list" id="palette-list" role="listbox" aria-label="Results">
          {rows.length === 0 && (
            <li className="palette__empty">Nothing matches that search.</li>
          )}
          {rows.map((row, index) => (
            <li key={`${row.kind}-${row.id}`} role="presentation">
              {index === 0 && row.kind === "page" && (
                <span className="palette__group">Pages</span>
              )}
              {index === pageCount && pageCount > 0 && (
                <span className="palette__group">Machines</span>
              )}
              <button
                type="button"
                id={`palette-${row.kind}-${row.id}`}
                role="option"
                aria-selected={index === active}
                className={`palette__option${index === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(row)}
              >
                <span className="palette__name">
                  {row.kind === "machine" ? (
                    <strong>{row.label}</strong>
                  ) : (
                    row.label
                  )}
                </span>
                <span className="palette__meta">{row.meta}</span>
                {index === active && <span className="palette__enter">↵</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="palette__foot">
          <span>↑ ↓ to move</span>
          <span>↵ to open</span>
          <span>Ctrl K to open anywhere</span>
        </div>
      </div>
    </div>
  );
}
