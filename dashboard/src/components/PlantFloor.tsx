import type { MachineRisk } from "../lib/data";
import { STATUS_LABEL } from "../lib/data";
import { byLineGrouped } from "../lib/derive";

/**
 * One tile per machine, grouped by production line. Colour is backed by the
 * machine's status word and a screen-reader label, so the grid never relies on
 * colour alone.
 */
export default function PlantFloor({
  machines,
  onOpen,
}: {
  machines: MachineRisk[];
  onOpen: (id: string) => void;
}) {
  const groups = byLineGrouped(machines);

  return (
    <div className="floor">
      <div className="floor__legend" aria-hidden="true">
        <span>
          <i className="dot dot--green" /> OK
        </span>
        <span>
          <i className="dot dot--amber" /> Watch
        </span>
        <span>
          <i className="dot dot--red" /> Check now
        </span>
      </div>

      {groups.map((group) => (
        <div className="floor__row" key={group.line}>
          <div className="floor__label">
            {group.line.replace("_", " ")}
            <span>{group.machines.length}</span>
          </div>
          <div className="floor__tiles">
            {group.machines.map((machine) => (
              <button
                key={machine.machine_id}
                type="button"
                className={`tile tile--${machine.risk_level}`}
                onClick={() => onOpen(machine.machine_id)}
                aria-label={`${machine.machine_id}, ${group.line.replace(
                  "_",
                  " ",
                )}, ${Math.round(machine.risk_score * 100)}% chance of breakdown, ${
                  STATUS_LABEL[machine.risk_level]
                }. Open machine details.`}
              >
                <span className="tile__id">{machine.machine_id}</span>
                <span className="tile__tip" aria-hidden="true">
                  <strong>{machine.machine_id}</strong>
                  {Math.round(machine.risk_score * 100)}% · {STATUS_LABEL[machine.risk_level]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
