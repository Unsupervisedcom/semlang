import { createToken, Lexer } from "chevrotain";

export const WhiteSpace = createToken({ name: "WhiteSpace", pattern: /\s+/, group: Lexer.SKIPPED });
export const LineComment = createToken({ name: "LineComment", pattern: /\/\/[^\n\r]*/, group: Lexer.SKIPPED });
export const Identifier = createToken({ name: "Identifier", pattern: /[A-Za-z_][A-Za-z0-9_]*/ });
export const StringLiteral = createToken({ name: "StringLiteral", pattern: /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/ });
export const NumberLiteral = createToken({ name: "NumberLiteral", pattern: /\d+(?:\.\d+)?/ });
export const SymbolToken = createToken({ name: "SymbolToken", pattern: /::|->|[{}():,?.=+\-*/<>]/ });
export const OtherToken = createToken({ name: "OtherToken", pattern: /[^\s{}():,?.=+\-*/<>]+/ });

const tokens = [WhiteSpace, LineComment, StringLiteral, NumberLiteral, Identifier, SymbolToken, OtherToken];
export const semlangLexer = new Lexer(tokens, { ensureOptimizations: false });

export function lexSemLang(source: string) {
  return semlangLexer.tokenize(source);
}
