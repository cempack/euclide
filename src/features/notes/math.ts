const FENCE = /^\s*(`{3,}|~{3,})/;
/** A whole line of `$$ … $$`, maybe inside a quote (`> `). */
const ONE_LINE = /^(\s*(?:>\s*)*)\$\$(.+?)\$\$\s*$/;

/**
 * `$$ … $$` alone on its line is display math to anyone who writes LaTeX,
 * but remark-math wants the dollars on lines of their own, else it sets the
 * formula inline. Rewrites such lines that way, outside code blocks.
 */
export function displayMath(markdown: string): string {
  if (!markdown.includes("$$")) return markdown;
  let fence = "";
  return markdown
    .split("\n")
    .map((line) => {
      const f = FENCE.exec(line);
      if (f) {
        if (!fence) fence = f[1];
        else if (f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length))
          fence = "";
        return line;
      }
      if (fence) return line;
      const m = ONE_LINE.exec(line);
      if (!m || m[2].includes("$$")) return line;
      const [, prefix, tex] = m;
      return `${prefix}$$\n${prefix}${tex.trim()}\n${prefix}$$`;
    })
    .join("\n");
}
