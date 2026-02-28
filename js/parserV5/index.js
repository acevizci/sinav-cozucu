// js/parserV5/index.js
// Public API: parseRawToQuestions(rawText)
import { tokenize, normalizeRawText } from "./tokenizer.js";
import { segment } from "./segmenter.js";
import { buildAST } from "./astBuilder.js";
import { registerStrategy, detectAndParse } from "./strategyRegistry.js";

import { mcqStrategy } from "./strategies/mcqStrategy.js";
import { trueFalseStrategy } from "./strategies/trueFalseStrategy.js";
import { openEndedStrategy } from "./strategies/openEndedStrategy.js";
import { essayStrategy } from "./strategies/essayStrategy.js";

// Register default strategies (ordered doesn't matter; scoring decides)
registerStrategy(trueFalseStrategy);
registerStrategy(openEndedStrategy);
registerStrategy(mcqStrategy);
registerStrategy(essayStrategy);

export function parseRawToQuestions(rawText, ctx = {}) {
  const norm = normalizeRawText(rawText);
  const tokens = tokenize(norm);
  const blocks = segment(tokens);
  const ast = buildAST(blocks);
  return detectAndParse(ast, ctx);
}
