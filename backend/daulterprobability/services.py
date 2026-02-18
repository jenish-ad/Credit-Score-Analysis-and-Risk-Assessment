from typing import Optional


def calculate_default_probability(
    score: int,
    *,
    risk_category: Optional[str] = None,
    utilization_pct: Optional[float] = None,
) -> float:
    """Return a bounded probability of default for the evaluation API.

    The score-based baseline is adjusted slightly by risk bucket and utilization
    so the value feels more realistic for UI display.
    """
    safe_score = max(300, min(900, int(score)))

    baseline = (850 - safe_score) / 550

    risk_adjustment = {
        "LOW": -0.03,
        "MEDIUM": 0.0,
        "HIGH": 0.05,
    }.get(str(risk_category or "").upper(), 0.0)

    utilization_adjustment = 0.0
    if utilization_pct is not None:
        safe_utilization = max(0.0, min(100.0, float(utilization_pct)))
        utilization_adjustment = (safe_utilization - 40.0) / 1000.0

    raw_probability = baseline + risk_adjustment + utilization_adjustment
    return round(max(0.01, min(0.95, raw_probability)), 4)


def as_percentage(probability: float) -> float:
    return round(float(probability) * 100, 2)
