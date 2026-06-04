export type TokenCategory =
  | "word"
  | "number"
  | "whitespace"
  | "newline"
  | "punctuation"
  | "operator"
  | "emoji"
  | "symbol"
  | "other";

export interface Token {
  text: string;
  index: number;
  id: number;
  category: TokenCategory;
  start: number;
  end: number;
  byteStart: number;
  byteEnd: number;
  bytes: number;
}

export interface ModelLimit {
  name: string;
  contextWindow: number;
  inputCostPerMillionTokens?: number;
}

export interface TokenSummary {
  characters: number;
  bytes: number;
  words: number;
  lines: number;
  tokens: number;
  model?: {
    name: string;
    contextWindow: number;
    contextPercentage: number;
    estimatedInputCost?: number;
  };
}

const encoder = new TextEncoder();

const tokenRules: ReadonlyArray<{
  category: TokenCategory;
  pattern: RegExp;
}> = [
  { category: "newline", pattern: /\r\n|\r|\n/uy },
  { category: "whitespace", pattern: /[\p{Zs}\t\f\v]+/uy },
  {
    category: "emoji",
    pattern:
      /(?:\p{Regional_Indicator}{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?)*)/uy,
  },
  {
    category: "number",
    pattern: /[+-]?(?:\p{Nd}+(?:[.,:_]\p{Nd}+)*)/uy,
  },
  {
    category: "word",
    pattern: /[\p{L}\p{M}_][\p{L}\p{M}\p{Nd}_]*(?:['’.-][\p{L}\p{M}\p{Nd}_]+)*/uy,
  },
  {
    category: "operator",
    pattern: /(?:===|!==|!=|=>|->|::|\+\+|--|&&|\|\||\?\?|[+\-*/%=&|^<>~]=?)/uy,
  },
  { category: "punctuation", pattern: /[\p{P}]/uy },
  { category: "symbol", pattern: /[\p{S}]/uy },
  { category: "other", pattern: /[\s\S]/uy },
];

export const DEFAULT_MODEL_LIMITS: readonly ModelLimit[] = [
  { name: "Small context (8K)", contextWindow: 8_192 },
  { name: "Medium context (32K)", contextWindow: 32_768 },
  { name: "Large context (128K)", contextWindow: 131_072 },
];

export function tokenize(text: string): Token[] {
  if (!text) {
    return [];
  }

  const tokens: Token[] = [];
  let position = 0;
  let bytePosition = 0;

  while (position < text.length) {
    const match = matchNextToken(text, position);
    const tokenText = match.text;
    const bytes = byteLength(tokenText);
    const end = position + tokenText.length;

    tokens.push({
      text: tokenText,
      index: tokens.length,
      id: tokenId(tokenText, match.category),
      category: match.category,
      start: position,
      end,
      byteStart: bytePosition,
      byteEnd: bytePosition + bytes,
      bytes,
    });

    position = end;
    bytePosition += bytes;
  }

  return tokens;
}

export function summarizeTokens(
  text: string,
  tokens = tokenize(text),
  model?: ModelLimit,
): TokenSummary {
  const summary: TokenSummary = {
    characters: [...text].length,
    bytes: byteLength(text),
    words: countWords(tokens),
    lines: countLines(text),
    tokens: tokens.length,
  };

  if (model) {
    const contextPercentage =
      model.contextWindow > 0
        ? Math.min(100, (tokens.length / model.contextWindow) * 100)
        : 0;

    summary.model = {
      name: model.name,
      contextWindow: model.contextWindow,
      contextPercentage,
      estimatedInputCost:
        model.inputCostPerMillionTokens === undefined
          ? undefined
          : (tokens.length / 1_000_000) * model.inputCostPerMillionTokens,
    };
  }

  return summary;
}

export function estimateContextPercentage(
  tokenCount: number,
  contextWindow: number,
): number {
  if (contextWindow <= 0) {
    return 0;
  }

  return Math.min(100, (tokenCount / contextWindow) * 100);
}

export function estimateInputCost(
  tokenCount: number,
  inputCostPerMillionTokens: number,
): number {
  return (tokenCount / 1_000_000) * inputCostPerMillionTokens;
}

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function matchNextToken(
  text: string,
  position: number,
): { text: string; category: TokenCategory } {
  for (const rule of tokenRules) {
    rule.pattern.lastIndex = position;
    const match = rule.pattern.exec(text);
    if (match?.index === position && match[0].length > 0) {
      return { text: match[0], category: rule.category };
    }
  }

  const codePoint = text.codePointAt(position);
  const fallback = codePoint === undefined ? text[position] : String.fromCodePoint(codePoint);
  return { text: fallback, category: "other" };
}

function countWords(tokens: readonly Token[]): number {
  return tokens.filter(
    (token) => token.category === "word" || token.category === "number",
  ).length;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return text.split(/\r\n|\r|\n/).length;
}

function tokenId(text: string, category: TokenCategory): number {
  let hash = 0x811c9dc5;
  const value = `${category}:${text}`;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
