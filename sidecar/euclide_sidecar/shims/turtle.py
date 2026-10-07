"""A light `turtle` for Euclide: the usual teaching subset, drawn by
Euclide on a canvas (no Tk window). Geometry is computed here, in turtle
coordinates (origin at the centre, y upwards); Euclide receives drawing
operations in batches and animates them.

Supported: Turtle / Pen, Screen, movement (forward, left, goto, circle…),
pen (up, down, size, colours), fill, dot, write, stamp-less shapes, speed,
hide/show, clear/reset, bgcolor, title, setup, tracer/update, done.
"""

import math

_ops = []
_turtles = []
_colormode = 1.0
_BATCH = 400


def _emit(op):
    _ops.append(op)
    if len(_ops) >= _BATCH:
        flush()


def flush():
    """Sends the operations drawn since the last flush."""
    if not _ops:
        return
    from ..runner import emit

    emit({"t": "turtle", "ops": list(_ops)})
    _ops.clear()


def _css(color):
    """A turtle colour (name, "#hex", or an (r, g, b) tuple) as CSS."""
    if isinstance(color, str):
        name = color.strip()
        if not name:
            raise ValueError("couleur vide")
        return name.replace(" ", "").lower() if not name.startswith("#") else name
    try:
        r, g, b = color
    except (TypeError, ValueError):
        raise ValueError(f"couleur incomprise : {color!r}") from None
    scale = 255 / _colormode
    channels = [round(float(v) * scale) for v in (r, g, b)]
    if any(c < 0 or c > 255 for c in channels):
        raise ValueError(f"couleur hors limites pour colormode({_colormode:g}) : {color!r}")
    return "rgb({},{},{})".format(*channels)


def _color_args(args):
    if len(args) == 1:
        return _css(args[0])
    if len(args) == 3:
        return _css(args)
    raise TypeError('une couleur : un nom, "#rrggbb" ou trois nombres (r, g, b)')


class Turtle:
    _count = 0

    def __init__(self, shape="classic", visible=True):
        Turtle._count += 1
        self._id = Turtle._count
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._down = True
        self._width = 1
        self._pencolor = "black"
        self._fillcolor = "black"
        self._filling = None
        self._visible = visible
        self._speed = 3
        _turtles.append(self)
        _emit({"op": "turtle", "id": self._id, "x": 0, "y": 0, "heading": 0, "visible": visible})

    # -- movement ----------------------------------------------------------
    def _move_to(self, x, y):
        x, y = float(x), float(y)
        if self._down:
            _emit(
                {
                    "op": "line",
                    "id": self._id,
                    "from": [self._x, self._y],
                    "to": [x, y],
                    "color": self._pencolor,
                    "width": self._width,
                    "speed": self._speed,
                }
            )
        else:
            _emit({"op": "move", "id": self._id, "to": [x, y], "speed": self._speed})
        self._x, self._y = x, y
        if self._filling is not None:
            self._filling.append([x, y])

    def forward(self, distance):
        rad = math.radians(self._heading)
        self._move_to(self._x + distance * math.cos(rad), self._y + distance * math.sin(rad))

    def backward(self, distance):
        self.forward(-distance)

    def _turn(self, angle):
        self._heading = (self._heading + angle) % 360
        _emit({"op": "heading", "id": self._id, "heading": self._heading})

    def left(self, angle):
        self._turn(angle)

    def right(self, angle):
        self._turn(-angle)

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move_to(x, y)

    def setx(self, x):
        self._move_to(x, self._y)

    def sety(self, y):
        self._move_to(self._x, y)

    def setheading(self, angle):
        self._heading = angle % 360
        _emit({"op": "heading", "id": self._id, "heading": self._heading})

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def circle(self, radius, extent=None, steps=None):
        """CPython's algorithm: a regular polygon, the centre `radius` to the left."""
        if extent is None:
            extent = 360
        frac = abs(extent) / 360
        if steps is None:
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = extent / steps
        w2 = 0.5 * w
        length = 2.0 * radius * math.sin(math.radians(w2))
        if radius < 0:
            length, w, w2 = -length, -w, -w2
        self._turn(w2)
        for _ in range(steps):
            self.forward(length)
            self._turn(w)
        self._turn(-w2)

    # -- state ---------------------------------------------------------------
    def position(self):
        return (round(self._x, 10), round(self._y, 10))

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._heading

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        return math.degrees(math.atan2(y - self._y, x - self._x)) % 360

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(x - self._x, y - self._y)

    # -- pen -----------------------------------------------------------------
    def penup(self):
        self._down = False

    def pendown(self):
        self._down = True

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._width
        self._width = max(0.5, float(width))

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        self._pencolor = _color_args(args)

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        self._fillcolor = _color_args(args)

    def color(self, *args):
        if not args:
            return self._pencolor, self._fillcolor
        if len(args) == 2:
            self._pencolor, self._fillcolor = _css(args[0]), _css(args[1])
        else:
            self._pencolor = self._fillcolor = _color_args(args)

    def begin_fill(self):
        self._filling = [[self._x, self._y]]

    def end_fill(self):
        if self._filling and len(self._filling) > 2:
            _emit({"op": "fill", "id": self._id, "points": self._filling, "color": self._fillcolor})
        self._filling = None

    def filling(self):
        return self._filling is not None

    def dot(self, size=None, *color):
        diameter = size if size is not None else max(self._width + 4, 2 * self._width)
        _emit(
            {
                "op": "dot",
                "at": [self._x, self._y],
                "size": diameter,
                "color": _color_args(color) if color else self._pencolor,
            }
        )

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        name, size, style = (list(font) + ["Arial", 8, "normal"])[:3]
        _emit(
            {
                "op": "text",
                "at": [self._x, self._y],
                "text": str(arg),
                "align": align,
                "font": [str(name), float(size), str(style)],
                "color": self._pencolor,
            }
        )

    def speed(self, value=None):
        if value is None:
            return self._speed
        names = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        value = names.get(value, value)
        value = int(value) if value else 0
        self._speed = 0 if value <= 0 or value > 10 else value

    def hideturtle(self):
        self._visible = False
        _emit({"op": "visible", "id": self._id, "visible": False})

    def showturtle(self):
        self._visible = True
        _emit({"op": "visible", "id": self._id, "visible": True})

    def isvisible(self):
        return self._visible

    def shape(self, name=None):
        return "classic" if name is None else None

    def shapesize(self, *_args, **_kwargs):
        return None

    def stamp(self):
        return 0

    def clear(self):
        _emit({"op": "clear", "id": self._id})

    def reset(self):
        self.clear()
        self._down = True
        self._width = 1
        self._pencolor = self._fillcolor = "black"
        self.penup()
        self.home()
        self.pendown()

    def getscreen(self):
        return _screen

    # Short names, as in the standard module.
    fd = forward
    bk = back = backward
    lt = left
    rt = right
    setpos = setposition = goto
    seth = setheading
    pos = position
    pu = up = penup
    pd = down = pendown
    width = pensize
    ht = hideturtle
    st = showturtle


Pen = RawTurtle = Turtle


class _Screen:
    def bgcolor(self, *args):
        if args:
            _emit({"op": "bg", "color": _color_args(args)})

    def title(self, text):
        _emit({"op": "title", "text": str(text)})

    def setup(self, width=None, height=None, *_args, **_kwargs):
        if isinstance(width, (int, float)) and isinstance(height, (int, float)) and width > 1 and height > 1:
            _emit({"op": "size", "width": width, "height": height})

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if bg is not None:
            self.bgcolor(bg)

    def colormode(self, mode=None):
        global _colormode
        if mode is None:
            return _colormode
        if mode not in (1, 1.0, 255):
            raise ValueError("colormode(1.0) ou colormode(255)")
        _colormode = float(mode)

    def tracer(self, n=None, delay=None):
        if n is not None:
            _emit({"op": "tracer", "on": bool(n)})

    def update(self):
        return None

    def delay(self, *_args):
        return None

    def clear(self):
        _emit({"op": "clear", "id": None})

    def mainloop(self):
        flush()

    done = exitonclick = bye = mainloop

    def onclick(self, *_args, **_kwargs):
        return None

    onscreenclick = onkey = onkeypress = listen = ontimer = onclick

    def window_width(self):
        return 640

    def window_height(self):
        return 480


_screen = _Screen()
_default = None


def Screen():  # noqa: N802 - the standard module's name
    return _screen


def _turtle():
    global _default
    if _default is None:
        _default = Turtle()
    return _default


def _delegate(name):
    def call(*args, **kwargs):
        return getattr(_turtle(), name)(*args, **kwargs)

    call.__name__ = name
    return call


for _name in [n for n in dir(Turtle) if not n.startswith("_") and n != "getscreen"]:
    globals()[_name] = _delegate(_name)

for _name in (
    "bgcolor",
    "title",
    "setup",
    "screensize",
    "colormode",
    "tracer",
    "update",
    "delay",
    "mainloop",
    "done",
    "exitonclick",
    "bye",
    "onclick",
    "onscreenclick",
    "onkey",
    "onkeypress",
    "listen",
    "ontimer",
    "window_width",
    "window_height",
):
    globals()[_name] = getattr(_screen, _name)

clearscreen = _screen.clear
resetscreen = _screen.clear


class Terminator(Exception):  # noqa: N818 - the standard module's name
    pass


class TurtleGraphicsError(Exception):
    pass
