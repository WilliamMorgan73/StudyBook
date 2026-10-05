"""The demo server: app.desktop on a scratch data folder, with the clock frozen at Thu 19 Nov 2026 10:30 (still
ticking, so countdowns move). Run with backend/ on PYTHONPATH and time-machine installed (see run.sh)."""
import sys
from datetime import datetime

import time_machine

time_machine.travel(datetime(2026, 11, 19, 10, 30).astimezone(), tick=True).start()
from app.desktop import main

main(sys.argv[1:])
