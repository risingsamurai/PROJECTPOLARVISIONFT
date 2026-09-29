"""
Configurable vessel parameters for the POLARIS fuel model.

All tunable constants are defined here in one place.
The cubic-law fuel model: fuel_rate (MT/h) proportional to (speed/design_speed)^3 * design_fuel_rate
Fuel per NM therefore scales with (speed/design_speed)^2 * (design_fuel_rate / design_speed)
"""

# ── Vessel design parameters ─────────────────────────────────────────────────
DESIGN_SPEED_KTS: float = 14.0          # knots – design (service) speed
DESIGN_FUEL_DAY: float = 42.0           # MT/day at design speed in calm open water
DESIGN_FUEL_HOUR: float = DESIGN_FUEL_DAY / 24.0   # MT/h at design speed

# ── Profile cruising speeds (knots) ──────────────────────────────────────────
PROFILE_SPEEDS: dict = {
    "safest":   9.5,   # slow and safe
    "balanced": 12.5,  # moderate
    "fastest":  16.0,  # above design speed (extra fuel cost)
    "eco":      11.0,  # optimal Eco/fuel-efficient speed
}

# ── Ice resistance multipliers ────────────────────────────────────────────────
# Added resistance factor (multiplied to calm-water fuel rate) as a function
# of sea-ice concentration (sic 0..1).  Values between breakpoints are linearly
# interpolated.  Also caps achievable speed in ice.
# Format: [(sic_threshold, resistance_multiplier), ...]
ICE_RESISTANCE_BREAKPOINTS: list = [
    (0.00, 1.0),   # open water – no added resistance
    (0.15, 1.0),   # ice edge – negligible below 15 %
    (0.30, 1.15),  # 30 % – 15 % added resistance
    (0.50, 1.45),  # 50 % – 45 % added resistance
    (0.70, 2.00),  # 70 % – doubled fuel burn
    (0.80, 3.50),  # 80 % – heavily impeded
    (0.90, 8.00),  # 90 % – nearly impassable for non-icebreaker
    (1.00, 20.0),  # 100 % – effectively impassable
]

# Maximum speed fraction in ice (fraction of calm-water speed)
ICE_SPEED_REDUCTION_BREAKPOINTS: list = [
    (0.00, 1.00),
    (0.15, 1.00),
    (0.40, 0.85),
    (0.60, 0.65),
    (0.80, 0.40),
    (1.00, 0.10),
]

# ── Weather (ERA5) resistance parameters ─────────────────────────────────────
# Significant wave height (Hs in metres) → added resistance multiplier
WAVE_RESISTANCE_COEFF: float = 0.025    # per metre of Hs added to fuel rate fraction
# Wind head-seas drag term (wind speed in m/s)
WIND_DRAG_COEFF: float = 0.0015        # per (m/s)^2 added to fuel rate fraction

# ── Impassable ice threshold ──────────────────────────────────────────────────
IMPASSABLE_ICE_SIC: float = 0.92       # sic above this -> treated as strong barrier


def min_fuel_per_nm() -> float:
    """Minimum fuel per NM at eco speed in open water (admissible A* heuristic floor)."""
    v = PROFILE_SPEEDS["eco"]
    rate_mth = DESIGN_FUEL_HOUR * (v / DESIGN_SPEED_KTS) ** 3
    return rate_mth / v  # MT per NM
