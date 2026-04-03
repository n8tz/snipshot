import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';
import type { TokenizedLine } from './types.js';

let highlighterInstance: Highlighter | null = null;

const DEFAULT_COLOR = '#abb2bf';
const THEME = 'one-dark-pro';

async function getHighlighter(lang: string): Promise<Highlighter> {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({
      themes: [THEME],
      langs: [lang as any],
    });
  } else {
    const loaded = highlighterInstance.getLoadedLanguages();
    if (!loaded.includes(lang)) {
      await highlighterInstance.loadLanguage(lang as any);
    }
  }
  return highlighterInstance;
}

function isLanguageSupported(lang: string): boolean {
  return lang in bundledLanguages;
}

// Fallback: split code into lines of plain tokens (no syntax coloring)
function plainTokenize(code: string): TokenizedLine[] {
  return code.split('\n').map(line => [{ text: line, color: DEFAULT_COLOR }]);
}

export async function tokenizeCode(code: string, lang: string): Promise<TokenizedLine[]> {
  // If the language is not supported by Shiki, fall back to plain text
  if (!isLanguageSupported(lang)) {
    return plainTokenize(code);
  }

  try {
    const highlighter = await getHighlighter(lang);

    const result = highlighter.codeToTokensBase(code, {
      lang: lang as any,
      theme: THEME,
    });

    return result.map(line =>
      line.map(token => ({
        text: token.content,
        color: token.color || DEFAULT_COLOR,
      }))
    );
  } catch {
    // If tokenization fails for any reason, fall back to plain text
    return plainTokenize(code);
  }
}
