"""A light `matplotlib.pyplot` for Euclide: the functions a maths or NSI
lesson uses, drawn as SVG in Euclide's style and shown under the console.

Supported: plot, scatter, bar, hist, xlabel, ylabel, title, legend, grid,
axis, xlim, ylim, axhline, axvline, text, figure, show, savefig, clf, close.
A figure left unshown when the script ends is shown anyway.
"""

import builtins
import math
from html import escape

WIDTH, HEIGHT = 640, 420
CYCLE = ["#0f4fa8", "#c2410c", "#116b2e", "#7c3aed", "#a4262c", "#0e7c86", "#8a5300", "#5a5a5a"]
LETTERS = {
    "b": "#0f4fa8",
    "g": "#116b2e",
    "r": "#a4262c",
    "c": "#0e7c86",
    "m": "#9d2f8f",
    "y": "#b88a00",
    "k": "#111213",
    "w": "#ffffff",
}
NAMED = {"blue": "#0f4fa8", "red": "#a4262c", "green": "#116b2e", "orange": "#c2410c", "purple": "#7c3aed"}
MARKERS = set("o.s^vx+*Dd")
INK, MUTED, LINE, PAPER = "#111213", "#5f5d58", "#dedbd4", "#ffffff"
FONT = "IBM Plex Sans, Segoe UI, Helvetica, Arial, sans-serif"


class _Figure:
    def __init__(self, figsize=None):
        self.series = []
        self.lines = []  # axhline / axvline
        self.texts = []
        self.title = self.xlabel = self.ylabel = ""
        self.legend = False
        self.grid = False
        self.xlim = self.ylim = None
        self.equal = False
        self.axis_off = False
        self.categories = None
        w, h = figsize or (WIDTH / 100, HEIGHT / 100)
        self.width = max(240, min(1200, round(float(w) * 100)))
        self.height = max(180, min(900, round(float(h) * 100)))

    def empty(self):
        return not (self.series or self.lines or self.texts)

    def next_color(self):
        return CYCLE[len(self.series) % len(CYCLE)]


_fig = _Figure()


def _color(value, fig):
    if value is None:
        return fig.next_color()
    if isinstance(value, str):
        if value.startswith("C") and value[1:].isdigit():
            return CYCLE[int(value[1:]) % len(CYCLE)]
        return LETTERS.get(value, NAMED.get(value, value))
    if isinstance(value, (tuple, list)) and len(value) >= 3:
        r, g, b = (float(v) for v in value[:3])
        scale = 255 if max(r, g, b) <= 1 else 1
        return "rgb({},{},{})".format(*(round(c * scale) for c in (r, g, b)))
    raise ValueError(f"couleur incomprise : {value!r}")


def _numbers(values, what):
    try:
        out = [float(v) for v in values]
    except (TypeError, ValueError):
        raise TypeError(f"{what} : une liste de nombres est attendue") from None
    return out


def _parse_fmt(fmt):
    color = marker = None
    style = None
    rest = fmt or ""
    for token in ("--", "-.", ":", "-"):
        if token in rest:
            style = token
            rest = rest.replace(token, "", 1)
            break
    for ch in rest:
        if ch in LETTERS:
            color = LETTERS[ch]
        elif ch in MARKERS:
            marker = ch
    if style is None and marker is None:
        style = "-"
    return color, marker, style


def plot(*args, label=None, color=None, linestyle=None, ls=None, marker=None, linewidth=None, lw=None, **_):
    args = list(args)
    fmt = args.pop() if args and isinstance(args[-1], str) else None
    if len(args) == 1:
        ys = _numbers(args[0], "plot")
        xs = [float(i) for i in range(len(ys))]
    elif len(args) == 2:
        xs, ys = _numbers(args[0], "plot (x)"), _numbers(args[1], "plot (y)")
    else:
        raise TypeError("plot(x, y) ou plot(y)")
    if len(xs) != len(ys):
        raise ValueError(f"plot : x et y n'ont pas la même longueur ({len(xs)} et {len(ys)})")
    fcolor, fmarker, fstyle = _parse_fmt(fmt)
    _fig.series.append(
        {
            "kind": "line",
            "x": xs,
            "y": ys,
            "color": _color(color or fcolor, _fig),
            # « "o" » alone draws the points, without a line through them.
            "style": linestyle or ls or fstyle or ("None" if fmarker else "-"),
            "marker": marker or fmarker,
            "width": float(linewidth or lw or 2),
            "label": label,
        }
    )


def scatter(x, y, s=None, c=None, color=None, label=None, marker="o", **_):
    xs, ys = _numbers(x, "scatter (x)"), _numbers(y, "scatter (y)")
    if len(xs) != len(ys):
        raise ValueError("scatter : x et y n'ont pas la même longueur")
    size = s if isinstance(s, (int, float)) else 36
    _fig.series.append(
        {
            "kind": "scatter",
            "x": xs,
            "y": ys,
            "color": _color(color or (c if isinstance(c, str) else None), _fig),
            "size": math.sqrt(size) / 1.6,
            "marker": marker,
            "label": label,
        }
    )


def bar(x, height, width=0.8, color=None, label=None, **_):
    x = list(x)
    heights = _numbers(height, "bar (hauteurs)")
    if x and all(isinstance(v, str) for v in x):
        _fig.categories = x
        xs = [float(i) for i in range(len(x))]
    else:
        xs = _numbers(x, "bar (x)")
    _fig.series.append(
        {
            "kind": "bar",
            "x": xs,
            "y": heights,
            "w": float(width),
            "color": _color(color, _fig),
            "label": label,
        }
    )


def hist(data, bins=10, color=None, edgecolor=None, label=None, range=None, **_):  # noqa: A002
    values = _numbers(data, "hist")
    if not values:
        return [], [], None
    lo, hi = range if range else (min(values), max(values))
    if hi == lo:
        hi = lo + 1
    if isinstance(bins, int):
        edges = [lo + (hi - lo) * i / bins for i in builtins.range(bins + 1)]
    else:
        edges = _numbers(bins, "hist (classes)")
    counts = [0] * (len(edges) - 1)
    for v in values:
        for i in builtins.range(len(counts)):
            last = i == len(counts) - 1
            if edges[i] <= v < edges[i + 1] or (last and v == edges[-1]):
                counts[i] += 1
                break
    _fig.series.append(
        {
            "kind": "hist",
            "edges": edges,
            "y": [float(c) for c in counts],
            "x": edges,
            "color": _color(color, _fig),
            "edge": _color(edgecolor, _fig) if edgecolor else PAPER,
            "label": label,
        }
    )
    return counts, edges, None


def axhline(y=0, color=None, linestyle="-", ls=None, linewidth=1, **_):
    _fig.lines.append(
        {"axis": "h", "v": float(y), "color": _color(color or "k", _fig), "style": ls or linestyle}
    )


def axvline(x=0, color=None, linestyle="-", ls=None, linewidth=1, **_):
    _fig.lines.append(
        {"axis": "v", "v": float(x), "color": _color(color or "k", _fig), "style": ls or linestyle}
    )


def text(x, y, s, color=None, fontsize=None, **_):
    _fig.texts.append(
        {
            "x": float(x),
            "y": float(y),
            "s": str(s),
            "color": _color(color or "k", _fig),
            "size": fontsize or 12,
        }
    )


def xlabel(s, **_):
    _fig.xlabel = str(s)


def ylabel(s, **_):
    _fig.ylabel = str(s)


def title(s, **_):
    _fig.title = str(s)


LOCATIONS = {"upper right", "upper left", "lower left", "lower right"}


def legend(*_args, loc="best", **_kwargs):
    _fig.legend = loc if loc in LOCATIONS else "best"


def grid(visible=True, *_args, **_kwargs):
    _fig.grid = bool(visible)


def xlim(*args, **kwargs):
    lo, hi = (args[0] if len(args) == 1 else args) if args else (kwargs.get("left"), kwargs.get("right"))
    _fig.xlim = (float(lo), float(hi))
    return _fig.xlim


def ylim(*args, **kwargs):
    lo, hi = (args[0] if len(args) == 1 else args) if args else (kwargs.get("bottom"), kwargs.get("top"))
    _fig.ylim = (float(lo), float(hi))
    return _fig.ylim


def axis(arg=None, **_):
    if arg in ("equal", "scaled", "square"):
        _fig.equal = True
    elif arg == "off":
        _fig.axis_off = True
    elif arg is not None:
        xmin, xmax, ymin, ymax = (float(v) for v in arg)
        _fig.xlim, _fig.ylim = (xmin, xmax), (ymin, ymax)


def figure(*_args, figsize=None, **_kwargs):
    global _fig
    if not _fig.empty():
        show()
    _fig = _Figure(figsize)
    return _fig


def subplot(*_args, **_kwargs):
    raise NotImplementedError(
        "subplot n'est pas disponible dans Euclide : tracez un graphique à la fois (plt.show() entre deux)."
    )


subplots = subplot


def clf():
    global _fig
    _fig = _Figure()


def close(*_args):
    clf()


def gca():
    return _fig


def gcf():
    return _fig


def show(*_args, **_kwargs):
    global _fig
    if _fig.empty():
        return
    from ..runner import emit

    emit({"t": "plot", "svg": render(_fig)})
    _fig = _Figure()


def savefig(fname, *_args, **_kwargs):
    import sys

    name = str(fname)
    if not name.lower().endswith(".svg"):
        name = name.rsplit(".", 1)[0] + ".svg"
        sys.stderr.write(f"Euclide enregistre les graphiques en SVG : {name}\n")
    with open(name, "w", encoding="utf-8") as fh:
        fh.write(render(_fig))


def flush():
    """At the end of the script: show what was drawn but never shown."""
    show()


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------


def _nice_ticks(lo, hi, count=6):
    if hi == lo:
        lo, hi = lo - 1, hi + 1
    span = hi - lo
    raw = span / max(1, count - 1)
    mag = 10 ** math.floor(math.log10(raw))
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    start = math.floor(lo / step) * step
    ticks = []
    v = start
    while v <= hi + step * 1e-9:
        if v >= lo - step * 1e-9:
            ticks.append(round(v, 10))
        v += step
    return ticks, step


def _fmt(v, step):
    """A tick label, with as many decimals as its step has (2,5 · 5,0 · 7,5)."""
    decimals = next((d for d in builtins.range(10) if abs(step * 10**d - round(step * 10**d)) < 1e-6), 10)
    text = f"{v:.{decimals}f}"
    if text.lstrip("-").strip("0.") == "":
        text = text.lstrip("-")
    return text.replace("-", "−").replace(".", ",")


def _bounds(fig):
    xs, ys = [], []
    for s in fig.series:
        if s["kind"] == "bar":
            xs += [x - s["w"] / 2 for x in s["x"]] + [x + s["w"] / 2 for x in s["x"]]
            ys += s["y"] + [0.0]
        elif s["kind"] == "hist":
            xs += s["edges"]
            ys += s["y"] + [0.0]
        else:
            xs += s["x"]
            ys += s["y"]
    for line in fig.lines:
        (ys if line["axis"] == "h" else xs).append(line["v"])
    for t in fig.texts:
        xs.append(t["x"])
        ys.append(t["y"])
    finite = [v for v in xs if math.isfinite(v)], [v for v in ys if math.isfinite(v)]
    xs, ys = finite
    x0, x1 = (min(xs), max(xs)) if xs else (0.0, 1.0)
    y0, y1 = (min(ys), max(ys)) if ys else (0.0, 1.0)
    # A little air around the data, as matplotlib does.
    pad_x = (x1 - x0) * 0.05 or 1
    pad_y = (y1 - y0) * 0.05 or 1
    x0, x1 = fig.xlim or (x0 - pad_x, x1 + pad_x)
    y0, y1 = fig.ylim or (y0 - pad_y, y1 + pad_y)
    return x0, x1, y0, y1


def _dash(style):
    return {"--": "7 5", ":": "2 4", "-.": "7 4 2 4"}.get(style or "-", "")


def _marker(kind, x, y, r, color):
    if kind in ("s", "D", "d"):
        return (
            f'<rect x="{x - r:.1f}" y="{y - r:.1f}" width="{2 * r:.1f}" height="{2 * r:.1f}" fill="{color}"/>'
        )
    if kind in ("x", "+"):
        a = f'<line x1="{x - r:.1f}" y1="{y - r:.1f}" x2="{x + r:.1f}" y2="{y + r:.1f}"'
        b = f'<line x1="{x - r:.1f}" y1="{y + r:.1f}" x2="{x + r:.1f}" y2="{y - r:.1f}"'
        if kind == "+":
            a = f'<line x1="{x - r:.1f}" y1="{y:.1f}" x2="{x + r:.1f}" y2="{y:.1f}"'
            b = f'<line x1="{x:.1f}" y1="{y - r:.1f}" x2="{x:.1f}" y2="{y + r:.1f}"'
        return f'{a} stroke="{color}" stroke-width="2"/>{b} stroke="{color}" stroke-width="2"/>'
    if kind in ("^", "v"):
        d = -1 if kind == "^" else 1
        return (
            f'<path d="M{x:.1f},{y + d * r:.1f} L{x - r:.1f},{y - d * r:.1f} '
            f'L{x + r:.1f},{y - d * r:.1f} Z" fill="{color}"/>'
        )
    radius = r * (0.5 if kind == "." else 1)
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{radius:.1f}" fill="{color}"/>'


def render(fig):
    w, h = fig.width, fig.height
    left = 58 if fig.ylabel else 46
    bottom = 50 if fig.xlabel else 34
    top = 38 if fig.title else 16
    right = 18
    pw, ph = w - left - right, h - top - bottom
    x0, x1, y0, y1 = _bounds(fig)
    if fig.equal:
        sx, sy = pw / (x1 - x0), ph / (y1 - y0)
        k = min(sx, sy)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        x0, x1 = cx - pw / k / 2, cx + pw / k / 2
        y0, y1 = cy - ph / k / 2, cy + ph / k / 2

    def X(v):  # noqa: N802
        return left + (v - x0) / (x1 - x0) * pw

    def Y(v):  # noqa: N802
        return top + ph - (v - y0) / (y1 - y0) * ph

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'font-family="{FONT}" font-size="12">',
        f'<rect width="{w}" height="{h}" fill="{PAPER}"/>',
        f'<clipPath id="plot"><rect x="{left}" y="{top}" width="{pw}" height="{ph}"/></clipPath>',
    ]
    if fig.title:
        out.append(
            f'<text x="{left + pw / 2:.1f}" y="{top - 14}" text-anchor="middle" font-size="14" '
            f'font-weight="600" fill="{INK}">{escape(fig.title)}</text>'
        )

    if not fig.axis_off:
        xticks, xstep = _nice_ticks(x0, x1)
        yticks, ystep = _nice_ticks(y0, y1)
        if fig.categories:
            xticks = [float(i) for i in range(len(fig.categories))]
        for v in yticks:
            y = Y(v)
            if fig.grid:
                out.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + pw}" y2="{y:.1f}" stroke="{LINE}"/>')
            out.append(
                f'<text x="{left - 6}" y="{y + 4:.1f}" text-anchor="end" fill="{MUTED}">{_fmt(v, ystep)}</text>'
            )
        for i, v in enumerate(xticks):
            x = X(v)
            if fig.grid:
                out.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + ph}" stroke="{LINE}"/>')
            label = escape(str(fig.categories[i])) if fig.categories else _fmt(v, xstep)
            out.append(
                f'<text x="{x:.1f}" y="{top + ph + 18}" text-anchor="middle" fill="{MUTED}">{label}</text>'
            )
        out.append(
            f'<rect x="{left}" y="{top}" width="{pw}" height="{ph}" fill="none" stroke="{MUTED}" stroke-width="1"/>'
        )
        if fig.xlabel:
            out.append(
                f'<text x="{left + pw / 2:.1f}" y="{h - 10}" text-anchor="middle" fill="{INK}">'
                f"{escape(fig.xlabel)}</text>"
            )
        if fig.ylabel:
            out.append(
                f'<text transform="translate(16,{top + ph / 2:.1f}) rotate(-90)" text-anchor="middle" '
                f'fill="{INK}">{escape(fig.ylabel)}</text>'
            )

    out.append('<g clip-path="url(#plot)">')
    for line in fig.lines:
        dash = _dash(line["style"])
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        if line["axis"] == "h":
            y = Y(line["v"])
            out.append(
                f'<line x1="{left}" y1="{y:.1f}" x2="{left + pw}" y2="{y:.1f}" stroke="{line["color"]}"{dash_attr}/>'
            )
        else:
            x = X(line["v"])
            out.append(
                f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + ph}" stroke="{line["color"]}"{dash_attr}/>'
            )
    for s in fig.series:
        color = s["color"]
        if s["kind"] == "bar":
            for x, y in zip(s["x"], s["y"], strict=False):
                xa, xb = X(x - s["w"] / 2), X(x + s["w"] / 2)
                ya, yb = Y(max(0.0, y)), Y(min(0.0, y))
                out.append(
                    f'<rect x="{xa:.1f}" y="{ya:.1f}" width="{xb - xa:.1f}" height="{yb - ya:.1f}" fill="{color}"/>'
                )
        elif s["kind"] == "hist":
            for (ea, eb), y in zip(zip(s["edges"], s["edges"][1:], strict=False), s["y"], strict=False):
                xa, xb = X(ea), X(eb)
                ya, yb = Y(y), Y(0.0)
                out.append(
                    f'<rect x="{xa:.1f}" y="{ya:.1f}" width="{xb - xa:.1f}" height="{yb - ya:.1f}" '
                    f'fill="{color}" stroke="{s["edge"]}"/>'
                )
        elif s["kind"] == "scatter":
            for x, y in zip(s["x"], s["y"], strict=False):
                if math.isfinite(x) and math.isfinite(y):
                    out.append(_marker(s["marker"], X(x), Y(y), s["size"], color))
        else:
            if s["style"] not in (None, "", "None", " "):
                parts, pen = [], "M"
                for x, y in zip(s["x"], s["y"], strict=False):
                    if not (math.isfinite(x) and math.isfinite(y)):
                        pen = "M"
                        continue
                    parts.append(f"{pen}{X(x):.1f},{Y(y):.1f}")
                    pen = "L"
                dash = _dash(s["style"])
                dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
                out.append(
                    f'<path d="{" ".join(parts)}" fill="none" stroke="{color}" stroke-width="{s["width"]}" '
                    f'stroke-linejoin="round" stroke-linecap="round"{dash_attr}/>'
                )
            if s["marker"]:
                for x, y in zip(s["x"], s["y"], strict=False):
                    if math.isfinite(x) and math.isfinite(y):
                        out.append(_marker(s["marker"], X(x), Y(y), 3.5, color))
    for t in fig.texts:
        out.append(
            f'<text x="{X(t["x"]):.1f}" y="{Y(t["y"]):.1f}" font-size="{t["size"]}" fill="{t["color"]}">'
            f"{escape(t['s'])}</text>"
        )
    out.append("</g>")

    labelled = [s for s in fig.series if s.get("label")]
    if fig.legend and labelled:
        width = max(len(str(s["label"])) for s in labelled) * 7 + 34
        height = len(labelled) * 18 + 8
        lx, ly = _legend_corner(fig, (left, top, pw, ph), (width, height), X, Y)
        out.append(
            f'<rect x="{lx:.1f}" y="{ly:.1f}" width="{width}" height="{height}" '
            f'rx="4" fill="{PAPER}" fill-opacity="0.92" stroke="{LINE}"/>'
        )
        for i, s in enumerate(labelled):
            y = ly + 13 + i * 18
            out.append(_legend_sample(s, lx + 8, y))
            out.append(
                f'<text x="{lx + 30:.1f}" y="{y + 4:.1f}" fill="{INK}">{escape(str(s["label"]))}</text>'
            )
    out.append("</svg>")
    return "".join(out)


def _legend_corner(fig, plot, size, X, Y):  # noqa: N803
    """Where the legend goes: the corner asked for, or the one hiding the
    least of the drawing (matplotlib's « best »)."""
    left, top, pw, ph = plot
    w, h = size
    corners = {
        "upper right": (left + pw - 10 - w, top + 10),
        "upper left": (left + 10, top + 10),
        "lower left": (left + 10, top + ph - 10 - h),
        "lower right": (left + pw - 10 - w, top + ph - 10 - h),
    }
    if fig.legend in corners:
        return corners[fig.legend]
    points = []
    for s in fig.series:
        if s["kind"] in ("bar", "hist"):
            # A bar hides what is under it: sample its whole height.
            xs = (
                s["x"]
                if s["kind"] == "bar"
                else [(a + b) / 2 for a, b in zip(s["edges"], s["edges"][1:], strict=False)]
            )
            for x, y in zip(xs, s["y"], strict=False):
                points += [(x, y * k / 4) for k in builtins.range(5)]
        else:
            points += list(zip(s["x"], s["y"], strict=False))
    pixels = [(X(x), Y(y)) for x, y in points if math.isfinite(x) and math.isfinite(y)]

    def hidden(corner):
        x, y = corners[corner]
        return sum(1 for px, py in pixels if x - 6 <= px <= x + w + 6 and y - 6 <= py <= y + h + 6)

    return corners[min(corners, key=hidden)]


def _legend_sample(s, x, y):
    """The legend's picture of a series: its line, its marker, or a swatch."""
    color = s["color"]
    if s["kind"] in ("bar", "hist"):
        return f'<rect x="{x:.1f}" y="{y - 5:.1f}" width="16" height="10" rx="1.5" fill="{color}"/>'
    if s["kind"] == "scatter":
        return _marker(s["marker"], x + 8, y, 4, color)
    out = ""
    if s["style"] not in (None, "", "None", " "):
        dash = _dash(s["style"])
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        out += f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x + 16:.1f}" y2="{y:.1f}" stroke="{color}" stroke-width="3"{dash_attr}/>'
    if s["marker"]:
        out += _marker(s["marker"], x + 8, y, 3.5, color)
    return out
