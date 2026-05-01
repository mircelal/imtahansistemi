import HeaderSection from "./components/HeaderSection";
import QuestionGrid from "./components/QuestionGrid";
import type { SheetConfig } from "./hooks/useSheetConfig";

type Props = {
  config: SheetConfig;
};

export default function DesignerCanvas({ config }: Props) {
  return (
    <div className="card">
      <HeaderSection title={config.title} />
      <QuestionGrid questionCount={config.question_count} optionsPerQuestion={config.options_per_question} />
    </div>
  );
}
