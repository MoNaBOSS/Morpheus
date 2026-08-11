import { describe, expect, it } from 'vitest';

import { classifyMainNavigation } from '../../electron/main/navigation-policy';

describe('main navigation policy', () => {
  const allowed = [
    'http://127.0.0.1:5173/',
    'file:///C:/Program%20Files/Morpheus/resources/app.asar/dist/index.html',
  ];

  it('allows only the configured renderer origin or packaged document', () => {
    expect(classifyMainNavigation('http://127.0.0.1:5173/?morpheusBoot=on#/chat', allowed)).toBe('allow');
    expect(classifyMainNavigation(
      'file:///C:/Program%20Files/Morpheus/resources/app.asar/dist/index.html?morpheusBoot=on',
      allowed,
    )).toBe('allow');
    expect(classifyMainNavigation(
      'file:///C:/Program%20Files/Morpheus/resources/app.asar/dist/other.html',
      allowed,
    )).toBe('block');
  });

  it('delegates ordinary web pages and blocks command-capable protocols', () => {
    expect(classifyMainNavigation('https://github.com/MoNaBOSS/Morpheus', allowed)).toBe('external');
    expect(classifyMainNavigation('http://example.com/', allowed)).toBe('external');
    expect(classifyMainNavigation('file:///C:/Windows/System32/calc.exe', allowed)).toBe('block');
    expect(classifyMainNavigation('ms-settings:privacy-microphone', allowed)).toBe('block');
    expect(classifyMainNavigation('not a url', allowed)).toBe('block');
  });
});
