type Props = {
  questionCount: number;
  optionsPerQuestion: number;
};

export default function QuestionGrid({ questionCount, optionsPerQuestion }: Props) {
  const options = ["A", "B", "C", "D", "E"].slice(0, optionsPerQuestion);
  return (
    <div className="mt-4 space-y-1 font-mono text-sm">
      {Array.from({ length: Math.min(questionCount, 20) }).map((_, i) => (
        <div key={i}>
          {i + 1}. {options.map((o) => `(${o})`).join(" ")}
        </div>
      ))}
      {questionCount > 20 && (
        <div className="text-slate-500">… və daha {questionCount - 20} sual</div>
      )}
    </div>
  );
}
