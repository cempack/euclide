"""Entry point.

euclide-sidecar --lane pronote|tools|index   a warm server (server.py)
euclide-sidecar --run                        one student script (runner.py)
"""

import sys

from . import protocol


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    protocol.use_utf8_stdio()
    if argv[:1] == ["--run"]:
        from . import runner

        runner.main()
        return
    lane = argv[1] if argv[:1] == ["--lane"] and len(argv) > 1 else "all"
    from . import server

    server.serve(lane)


if __name__ == "__main__":
    main()
