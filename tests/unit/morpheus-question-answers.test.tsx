import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MorpheusQuestionAnswers } from '@/components/morpheus/MorpheusQuestionAnswers';
afterEach(() => { cleanup(); vi.useRealTimers(); });
const question = 'Which folder should I use?\n1. Reports\n2. Downloads';
const choices = ['Reports', 'Downloads'];
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
describe('genuine question answer assistance', () => {
  it('offers actual choices immediately after playback ends and fills one selected answer', () => {
    const answer = vi.fn();
    const view = render(<MorpheusQuestionAnswers question={question} choices={choices} speechPending inputActive={false} onAnswer={answer} />);
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
    view.rerender(<MorpheusQuestionAnswers question={question} choices={choices} speechPending={false} inputActive={false} onAnswer={answer} />);
    expect(screen.getByTestId('morpheus-question-answers')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(answer).toHaveBeenCalledExactlyOnceWith('Reports');
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
  });
  it('gives active input room and restores unanswered choices when the draft is cleared', () => {
    const props = { question, choices, speechPending: false, onAnswer: vi.fn() };
    const view = render(<MorpheusQuestionAnswers {...props} inputActive={false} />);
    view.rerender(<MorpheusQuestionAnswers {...props} inputActive />);
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
    view.rerender(<MorpheusQuestionAnswers {...props} inputActive={false} />);
    expect(screen.getByTestId('morpheus-question-answers')).toBeVisible();
  });
  it('does not infer answers from numbered prose when Main supplied none', () => {
    render(<MorpheusQuestionAnswers question={question} speechPending={false} inputActive={false} onAnswer={vi.fn()} />);
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
  });
});
