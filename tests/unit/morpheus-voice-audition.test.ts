import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../shared/i18n/locales/en/dashboard.json';
import zh from '../../shared/i18n/locales/zh/dashboard.json';
import ja from '../../shared/i18n/locales/ja/dashboard.json';
import ru from '../../shared/i18n/locales/ru/dashboard.json';

describe('bounded prepared neural auditions', () => {
  it.each([
    ['en', en, 'Hello', 'fridge', 'example task update'],
    ['zh', zh, '你好', '冰箱', '任务进度示例'],
    ['ja', ja, 'こんにちは', '冷蔵庫', 'タスク報告の例'],
    ['ru', ru, 'Привет', 'холодильник', 'пример сообщения о задаче'],
  ] as const)('%s includes greeting humor and an explicitly prepared task example', (_locale, dictionary, greeting, joke, example) => {
    const sample = dictionary.morpheus.activationV2.voiceSample;
    expect(sample).toContain(greeting);
    expect(sample).toContain(joke);
    expect(sample).toContain(example);
    expect(sample.length).toBeLessThan(420);
  });

  it('keeps one audition speech call behind neural availability with OS fallback forbidden', () => {
    const source = readFileSync('src/components/morpheus/onboarding/MorpheusActivation.tsx', 'utf8');
    const preview = source.slice(source.indexOf('const previewVoice ='), source.indexOf('if (!enabled || dismissed'));
    expect(preview).toContain('if (!voice?.neuralSpeechAvailable) return;');
    expect(preview.match(/playMorpheusSpeech\(/g)).toHaveLength(1);
    expect(preview).toContain('allowWindowsFallback: false');
    expect(preview).toContain("t('morpheus.activationV2.voiceSample')");
  });
});
