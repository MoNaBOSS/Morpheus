import { useEffect, useState } from 'react';

/** Selecting a Main-validated answer fills the draft, never grants or executes. */
export function MorpheusQuestionAnswers({ question, choices, speechPending, inputActive, onAnswer }: {
  question: string | null; choices?: readonly string[]; speechPending: boolean; inputActive: boolean; onAnswer: (answer: string) => void;
}) {
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  const [consumed, setConsumed] = useState<string | null>(null);
  useEffect(() => {
    if (!question || speechPending || inputActive || consumed === question) return;
    const timer = window.setTimeout(() => setVisibleFor(question), 8_000);
    return () => window.clearTimeout(timer);
  }, [question, speechPending, inputActive, consumed]);
  // Remember the transition even when the user later clears the draft.
  if (inputActive && question && consumed !== question) setConsumed(question);
  if (!question || visibleFor !== question || speechPending || inputActive || consumed === question) return null;
  const answers = choices ?? [];
  if (answers.length < 2 || answers.length > 4) return null;
  return <div data-testid="morpheus-question-answers" className="mt-3 flex flex-wrap gap-2">
    {answers.map((answer) => <button key={answer} type="button" onClick={() => { setConsumed(question); onAnswer(answer); }}
      className="rounded-full border border-[#34684d] bg-[#102018] px-3 py-1.5 text-xs text-[#c8e7d2] hover:border-[#53edb4]">{answer}</button>)}
  </div>;
}
