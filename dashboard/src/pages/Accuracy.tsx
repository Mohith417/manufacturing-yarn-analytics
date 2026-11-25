import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "../components/ChartTooltip";
import EmptyState from "../components/EmptyState";
import InfoTip from "../components/InfoTip";
import PageHeader from "../components/PageHeader";
import Panel from "../components/Panel";
import Skeleton from "../components/Skeleton";
import { GLOSSARY } from "../lib/copy";
import {
  formatDecimal,
  formatInt,
  formatPct,
  useJson,
  type ConfusionMatrix,
  type FeatureImportance,
  type ModelMetric,
} from "../lib/data";

const MODEL_NAMES: Record<string, string> = {
  logistic_regression: "Logistic regression",
  decision_tree: "Decision tree",
  random_forest: "Random forest",
};

const MODEL_NOTES: Record<string, string> = {
  logistic_regression: "Used for every score here",
  decision_tree: "Simpler comparison",
  random_forest: "Many trees, compared",
};

function EffectChart({ rows }: { rows: FeatureImportance[] }) {
  return (
    <div className="chart" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 52, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="currentColor" strokeOpacity={0.14} horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10.5 }} />
          <YAxis
            type="category"
            dataKey="feature"
            width={138}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={
              <ChartTooltip
                format={(value) => value.toFixed(2)}
                names={{ importance: "Effect on risk" }}
                dots={false}
              />
            }
            cursor={{ fill: "rgba(99, 102, 241, 0.07)" }}
          />
          <Bar dataKey="importance" radius={[0, 6, 6, 0]} barSize={15} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell key={row.feature_key} fill={index === 0 ? "#6366f1" : "#c7d2fe"} />
            ))}
            <LabelList
              dataKey="importance"
              position="right"
              fill="currentColor"
              fontSize={10.5}
              formatter={(value: number | string) => Number(value).toFixed(2)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfusionGrid({ data }: { data: ConfusionMatrix }) {
  const [[tn, fp], [fn, tp]] = data.matrix;
  const total = tn + fp + fn + tp;
  const cells = [
    { label: "Correctly said OK", plain: "The machine ran and the model said so.", value: tn, tone: "ok" },
    { label: "False alarm", plain: "A check that finds the machine running.", value: fp, tone: "warn" },
    { label: "Missed breakdown", plain: "Downtime the model did not flag.", value: fn, tone: "bad" },
    { label: "Caught breakdown", plain: "Downtime the model did flag.", value: tp, tone: "ok" },
  ];

  return (
    <div>
      <div className="cm" role="table" aria-label="Prediction results on held-out rows">
        <div className="cm__corner" role="presentation" />
        <div className="cm__col" role="columnheader">
          Said OK
        </div>
        <div className="cm__col" role="columnheader">
          Said downtime
        </div>
        <div className="cm__row" role="rowheader">
          Actually OK
        </div>
        {cells.slice(0, 2).map((cell) => (
          <div
            key={cell.label}
            role="cell"
            className={`cm__cell cm__cell--${cell.tone}`}
            title={`${cell.label}: ${formatInt(cell.value)} rows — ${cell.plain}`}
          >
            <span className="cm__cell-label">{cell.label}</span>
            <span className="cm__cell-value">{formatInt(cell.value)}</span>
            <span className="cm__cell-share">
              {formatPct(total > 0 ? cell.value / total : null, 1)} of rows
            </span>
          </div>
        ))}
        <div className="cm__row" role="rowheader">
          Actually downtime
        </div>
        {cells.slice(2).map((cell) => (
          <div
            key={cell.label}
            role="cell"
            className={`cm__cell cm__cell--${cell.tone}`}
            title={`${cell.label}: ${formatInt(cell.value)} rows — ${cell.plain}`}
          >
            <span className="cm__cell-label">{cell.label}</span>
            <span className="cm__cell-value">{formatInt(cell.value)}</span>
            <span className="cm__cell-share">
              {formatPct(total > 0 ? cell.value / total : null, 1)} of rows
            </span>
          </div>
        ))}
      </div>

      <div className="stat-list stat-list--row">
        <div>
          <span>Rows tested</span>
          <strong>{formatInt(total)}</strong>
        </div>
        <div>
          <span>Recall from these cells</span>
          <strong>{formatPct(tp + fn > 0 ? tp / (tp + fn) : null, 0)}</strong>
        </div>
        <div>
          <span>Precision from these cells</span>
          <strong>{formatPct(tp + fp > 0 ? tp / (tp + fp) : null, 0)}</strong>
        </div>
      </div>
    </div>
  );
}

export default function Accuracy() {
  const metrics = useJson<ModelMetric[]>("model_metrics");
  const importance = useJson<FeatureImportance[]>("feature_importance");
  const confusion = useJson<ConfusionMatrix>("confusion_matrix");

  const rows = metrics.data ?? [];
  const bestF1 = rows.reduce<ModelMetric | null>(
    (best, row) => (!best || row.f1 > best.f1 ? row : best),
    null,
  );
  const matrix = confusion.data?.matrix;
  const [[tn, fp], [fn, tp]] = matrix ?? [
    [0, 0],
    [0, 0],
  ];
  const tested = tn + fp + fn + tp;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const falseAlarm = precision !== null ? 1 - precision : null;

  return (
    <>
      <PageHeader
        title="Accuracy"
        what="How good the prediction is, using plain words instead of scores you have to interpret."
      />

      <section className="verdict" aria-live="polite">
        {confusion.loading ? (
          <Skeleton lines={3} />
        ) : tested === 0 ? (
          <EmptyState
            message="The prediction results are not exported yet, so there is no verdict to show."
            detail={confusion.error ? `confusion_matrix.json — ${confusion.error}` : undefined}
          />
        ) : (
          <>
            <p className="verdict__kicker">Plain answer</p>
            <h2 className="verdict__line">
              Catches {formatPct(recall, 0)} of real downtime. About{" "}
              {falseAlarm !== null ? Math.round(falseAlarm * 10) : "—"} of every 10 alarms
              are false alarms.
            </h2>
            <p className="verdict__sub">
              A false alarm means someone checks a machine that turns out to be running.
              The model is useful for choosing what to check first, not for skipping
              checks.
            </p>
            <div className="verdict__stats">
              <div>
                <span>Real downtime caught</span>
                <strong>{formatPct(recall, 0)}</strong>
              </div>
              <div>
                <span>Alarms that are false</span>
                <strong>{formatPct(falseAlarm, 0)}</strong>
              </div>
              <div>
                <span>Rows tested</span>
                <strong>{formatInt(tested)}</strong>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="accuracy-grid">
        <Panel
          title="Model comparison"
          subtitle="All three models were trained on earlier data and tested on later data."
          hint={rows.length > 0 ? `${rows.length} models` : undefined}
        >
          {metrics.loading ? (
            <Skeleton lines={5} />
          ) : rows.length === 0 ? (
            <EmptyState
              message="No model scores are exported yet."
              detail={metrics.error ? `model_metrics.json — ${metrics.error}` : undefined}
            />
          ) : (
            <>
              <p className="scroll-hint scroll-hint--models">
                Scroll sideways to compare all four scores.
              </p>
              <div className="table-wrap">
                <table className="table table--models">
                <caption className="sr-only">Comparison of the three trained models</caption>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">
                      <InfoTip term="Catches" definition={GLOSSARY.recall.definition} />
                    </th>
                    <th className="num">
                      <InfoTip term="Alarm is right" definition={GLOSSARY.precision.definition} />
                    </th>
                    <th className="num">F1</th>
                    <th className="num">
                      <InfoTip term="Ranking" definition={GLOSSARY.rocAuc.definition} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.model} className={row.model === bestF1?.model ? "is-selected" : ""}>
                      <td>
                        <strong>{MODEL_NAMES[row.model] ?? row.model}</strong>
                        <div className="cell-note">{MODEL_NOTES[row.model] ?? ""}</div>
                      </td>
                      <td className="num">{formatPct(row.recall, 0)}</td>
                      <td className="num">{formatPct(row.precision, 0)}</td>
                      <td className="num">{formatDecimal(row.f1, 2)}</td>
                      <td className="num">{formatDecimal(row.roc_auc, 2)}</td>
                    </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="What the four outcomes mean"
          subtitle="Rows are what really happened; columns are what the model said."
          hint={tested > 0 ? `${formatInt(tested)} rows` : undefined}
        >
          {confusion.loading ? (
            <Skeleton lines={5} />
          ) : confusion.error || !confusion.data ? (
            <EmptyState
              message="The outcome counts are not exported yet."
              detail={confusion.error ? `confusion_matrix.json — ${confusion.error}` : undefined}
            />
          ) : (
            <ConfusionGrid data={confusion.data} />
          )}
        </Panel>
      </div>

      <Panel
        title="What pushes the score"
        subtitle="The six readings the model uses, ranked by how much they change the chance of breakdown."
        hint="All readings, one scale"
      >
        {importance.loading ? (
          <Skeleton variant="chart" />
        ) : importance.error || !importance.data?.length ? (
          <EmptyState
            message="No feature effects are exported yet."
            detail={importance.error ? `feature_importance.json — ${importance.error}` : undefined}
          />
        ) : (
          <EffectChart rows={importance.data} />
        )}
      </Panel>

      <p className="footnote">
        Low precision is a property of this synthetic dataset: running and downtime
        readings overlap, so many alarms point at a machine that turns out to be fine.
        The ranking still carries signal — that is why the model is used to order checks
        rather than to replace them.
      </p>
    </>
  );
}
