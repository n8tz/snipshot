import { createHighlighter, type Highlighter } from 'shiki';
import type { TokenizedLine } from './types.js';

let highlighterInstance: Highlighter | null = null;

const DEFAULT_COLOR = '#abb2bf';
const THEME = 'one-dark-pro';

async function getHighlighter(lang: string): Promise<Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({
      themes: [THEME],
      langs: [lang],
    });
  } else {
    const loaded = highlighterInstance.getLoadedLanguages();
    if (!loaded.includes(lang)) {
      await highlighterInstance.loadLanguage(lang as any);
    }
  }
  return highlighterInstance;
}

export async function tokenizeCode(code: string, lang: string): Promise<TokenizedLine[]> {
  const highlighter = await getHighlighter(lang);

  const result = highlighter.codeToTokensBase(code, {
    lang,
    theme: THEME,
  });

  return result.map(line =>
    line.map(token => ({
      text: token.content,
      color: token.color || DEFAULT_COLOR,
    }))
  );
}
