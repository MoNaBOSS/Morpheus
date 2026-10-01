import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MorpheusQuestionAnswers } from '@/components/morpheus/MorpheusQuestionAnswers';
afterEach(() => { cleanup(); vi.useRealTimers(); });
const question = 'Which folder should I use?\n1. Reports\n2. Downloads';
const choices = ['Reports', 'Downloads'];
describe('genuine question answer assistance', () => {
  it('starts eight seconds after playback ends and fills one selected answer', () => {
    vi.useFakeTimers(); const answer = vi.fn();
    const view = render(<MorpheusQuestionAnswers question={question} choices={choices} speechPending inputActive={false} onAnswer={answer} />);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
    view.rerender(<MorpheusQuestionAnswers question={question} choices={choices} speechPending={false} inputActive={false} onAnswer={answer} />);
    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(answer).toHaveBeenCalledExactlyOnceWith('Reports');
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
  });
  it('input consumes the current question and never revives old suggestions', () => {
    vi.useFakeTimers(); const props = { question, choices, speechPending: false, onAnswer: vi.fn() };
    const view = render(<MorpheusQuestionAnswers {...props} inputActive={false} />);
    act(() => vi.advanceTimersByTime(4_000));
    view.rerender(<MorpheusQuestionAnswers {...props} inputActive />);
    view.rerender(<MorpheusQuestionAnswers {...props} inputActive={false} />);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
  });
  it('does not infer answers from numbered prose when Main supplied none', () => {
    vi.useFakeTimers();
    render(<MorpheusQuestionAnswers question={question} speechPending={false} inputActive={false} onAnswer={vi.fn()} />);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.queryByTestId('morpheus-question-answers')).toBeNull();
  });
});
