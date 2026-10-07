/**
 * A note as slides: a line holding only `---` starts the next one (never
 * inside a code block, where it is just text). A slide made of a `# Title`
 * and at most a line under it is a title slide, shown centred.
 */
export function splitSlides(markdown: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const open = /^\s*(```|~~~)/.exec(line);
    if (open) fence = fence === null ? open[1] : line.trim().startsWith(fence) ? null : fence;
    if (fence === null && /^\s*---\s*$/.test(line)) {
      slides.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join("\n"));
  return slides.map((s) => s.trim()).filter(Boolean);
}

export function isTitleSlide(slide: string): boolean {
  const lines = slide.split("\n").filter((l) => l.trim());
  return (
    lines.length > 0 &&
    lines.length <= 2 &&
    /^#\s/.test(lines[0]) &&
    !lines.slice(1).some((l) => /^#{1,6}\s/.test(l))
  );
}
