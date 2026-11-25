import HowItWorksContent from "../components/HowItWorksContent";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";

export default function HowItWorks() {
  return (
    <>
      <PageHeader
        title="How it works"
        what="Three steps from factory records to this screen, plus an honest note on what the setup is not."
      />

      <div className="card card--pad">
        <HowItWorksContent />
      </div>

      <div className="how__foot">
        <a
          className="btn btn--ghost"
          href="https://github.com/Mohith417/manufacturing-yarn-analytics"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="github" size={15} />
          View the project on GitHub
        </a>
        <span className="footnote">
          Dataset is synthetic. Results come from a containerized Hadoop/YARN/Spark
          cluster on a single machine.
        </span>
      </div>
    </>
  );
}
