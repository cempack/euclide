/**
 * QR codes, drawn as one SVG path: a module is one unit, and a run of dark
 * modules on a row is one rectangle. The encoder (uqr, MIT) is loaded the
 * first time a code is shown.
 */
export type Modules = boolean[][];

export function modulesPath(modules: Modules): string {
  let d = "";
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return d;
}

/**
 * The modules of `text`, its quiet zone of `border` modules included; null
 * when it is too long for a QR code. Error correction « M »: a projected
 * code with a smudge still reads.
 */
export async function qrModules(text: string, border = 2): Promise<Modules | null> {
  const { encode } = await import("uqr");
  try {
    return encode(text, { ecc: "M", border }).data;
  } catch {
    return null;
  }
}
