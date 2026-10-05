import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Selecting a Main-validated answer fills the draft, never grants or executes. */
export function MorpheusQuestionAnswers({ question, choices, speechPending, inputActive, onAnswer }: {
  question: string | null; choices?: readonly string[]; speechPending: boolean; inputActive: boolean; onAnswer: (answer: string) => void;
}) {
  const { t } = useTranslation('dashboard');
  const [consumed, setConsumed] = useState<string | null>(null);
  if (!question || speechPending || inputActive || consumed === question) return null;
  const answers = choices ?? [];
  if (answers.length < 2 || answers.length > 4) return null;
  return <div data-testid="morpheus-question-answers" className="morpheus-question-answers mt-3">
    <p className="mb-2 text-xs text-muted-foreground">{t('morpheus.voice.question.hint')}</p>
    <div className="flex flex-wrap gap-2">
    {answers.map((answer) => <button key={answer} type="button" onClick={() => { setConsumed(question); onAnswer(answer); }}
      className="morpheus-question-choice rounded-full border px-3 py-1.5 text-xs">{answer}</button>)}
    </div>
  </div>;
}
