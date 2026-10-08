/**
 * Functions typed on the board (« f(x) = 2x² − 3x + 1 ») turned into a
 * JavaScript function, without eval: a small recursive-descent parser.
 * Written the way a French class writes them: decimal comma (« 0,5 »),
 * implicit products (« 2x », « 3(x+1) », « x(x−1) »), « x² », « √x »,
 * « × » and « ÷ », and the usual functions (sin, cos, tan, racine, abs,
 * exp, ln, log, ent).
 */

export type Compiled = { ok: true; f: (x: number) => number } | { ok: false; error: string };

type Node = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  racine: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  ent: Math.floor,
  floor: Math.floor,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

type Token =
  | { t: "num"; v: number; at: number }
  | { t: "name"; v: string; at: number }
  | { t: "op"; v: string; at: number }
  | { t: "end"; at: number };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9]/.test(c) || ((c === "." || c === ",") && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^[0-9]*[.,]?[0-9]*/.exec(src.slice(i))![0];
      out.push({ t: "num", v: Number(m.replace(",", ".")), at: i });
      i += m.length;
    } else if (/[a-zA-Zπ]/.test(c)) {
      const m = /^[a-zA-Zπ]+/.exec(src.slice(i))![0];
      // « 2xsin(x) »: split runs like « xsin » into known words and x.
      let rest = m.toLowerCase();
      let at = i;
      while (rest) {
        const word =
          Object.keys(FUNCTIONS)
            .concat(Object.keys(CONSTANTS))
            .sort((a, b) => b.length - a.length)
            .find((w) => rest.startsWith(w)) ?? rest[0];
        out.push({ t: "name", v: word, at });
        rest = rest.slice(word.length);
        at += word.length;
      }
      i += m.length;
    } else if ("+-*/^()²³√×÷·−".includes(c)) {
      const v = c === "×" || c === "·" ? "*" : c === "÷" ? "/" : c === "−" ? "-" : c;
      out.push({ t: "op", v, at: i });
      i++;
    } else {
      throw new SyntaxError(`Caractère inattendu « ${c} »`);
    }
  }
  out.push({ t: "end", at: src.length });
  return out;
}

/** Parses the right-hand side of « f(x) = … » (the left side may be typed or not). */
export function compile(input: string): Compiled {
  const src = input.replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=/, "");
  if (!src.trim()) return { ok: false, error: "Écrivez une expression en x." };
  let tokens: Token[];
  try {
    tokens = tokenize(src);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  let k = 0;
  const peek = () => tokens[k];
  const isOp = (v: string) => {
    const t = peek();
    return t.t === "op" && t.v === v;
  };
  const fail = (msg: string): never => {
    throw new SyntaxError(msg);
  };

  // An atom may follow another without a sign: that is a product.
  const startsAtom = () => {
    const t = peek();
    return t.t === "num" || t.t === "name" || (t.t === "op" && (t.v === "(" || t.v === "√"));
  };

  function expr(): Node {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[k++] as { v: string }).v;
      const a = left;
      const b = term();
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }

  function term(): Node {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[k++] as { v: string }).v;
        const a = left;
        const b = unary();
        left = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (startsAtom()) {
        const a = left;
        const b = power();
        left = (x) => a(x) * b(x);
      } else return left;
    }
  }

  function unary(): Node {
    if (isOp("-")) {
      k++;
      const a = unary();
      return (x) => -a(x);
    }
    if (isOp("+")) {
      k++;
      return unary();
    }
    return power();
  }

  function power(): Node {
    let base = postfix();
    if (isOp("^")) {
      k++;
      const e = unary();
      const b = base;
      base = (x) => Math.pow(b(x), e(x));
    }
    return base;
  }

  function postfix(): Node {
    let a = call();
    while (isOp("²") || isOp("³")) {
      const n = (tokens[k++] as { v: string }).v === "²" ? 2 : 3;
      const b = a;
      a = (x) => Math.pow(b(x), n);
    }
    return a;
  }

  function call(): Node {
    const t = peek();
    if (t.t === "op" && t.v === "√") {
      k++;
      const a = postfix();
      return (x) => Math.sqrt(a(x));
    }
    if (t.t === "name" && FUNCTIONS[t.v]) {
      k++;
      const fn = FUNCTIONS[t.v];
      // « sin x » as well as « sin(x) ».
      const a = isOp("(") ? atom() : postfix();
      return (x) => fn(a(x));
    }
    return atom();
  }

  function atom(): Node {
    const t = tokens[k++];
    if (t.t === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.t === "name") {
      if (t.v === "x") return (x) => x;
      if (t.v in CONSTANTS) {
        const v = CONSTANTS[t.v];
        return () => v;
      }
      return fail(`« ${t.v} » n'est pas connu : utilisez x, et sin, cos, racine, ln…`);
    }
    if (t.t === "op" && t.v === "(") {
      const inner = expr();
      if (!isOp(")")) fail("Il manque une parenthèse fermante.");
      k++;
      return inner;
    }
    return fail(
      t.t === "end" ? "L'expression s'arrête trop tôt." : `« ${(t as { v: string }).v} » inattendu.`,
    );
  }

  try {
    const f = expr();
    if (peek().t !== "end") fail(`« ${(peek() as { v: string }).v} » inattendu.`);
    // A constant still draws: f(x) = 3.
    f(1);
    return { ok: true, f };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
