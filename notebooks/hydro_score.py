"""Reactive worksheet for the Proof Of Flow screening equations.

Run with the standard library only:

    python notebooks/hydro_score.py

The same three terms are shown in the app's equation drawer.
Depression bonuses and missing-data priors are documented in the README
and are not applied by this script.
"""

from __future__ import annotations

import math


def core_score(distance_m: float, slope_percent: float, discharge_cfs: float) -> dict[str, float]:
    proximity = max(0.0, min(40.0, 40.0 * math.exp(-max(0.0, distance_m) / 350.0)))
    slope = max(0.0, min(30.0, 30.0 * (1.0 - min(slope_percent / 12.0, 1.0))))
    discharge = max(0.0, min(30.0, 30.0 * math.log10(max(0.0, discharge_cfs) + 1.0) / math.log10(50000.0)))
    total = round(max(0.0, min(100.0, proximity + slope + discharge)))
    return {"proximity": round(proximity, 1), "slope": round(slope, 1), "discharge": round(discharge, 1), "total": total}


if __name__ == "__main__":
    sample = core_score(829, 2.46, 3950)
    print("Iowa City-style sample", sample)
