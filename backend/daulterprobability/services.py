import math
from typing import Optional


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def calculate_default_probability(
    score: int,
    *,
    risk_category: Optional[str] = None,
    utilization_pct: Optional[float] = None,
) -> float:
    """Estimate probability of default with a logistic-style credit risk curve.

    Inputs are intentionally lightweight because this service is consumed by the
    evaluation API. We combine score, risk bucket, and utilization into a
    bounded probability suitable for UI and lending workflow decisions.
    """
    safe_score = int(_clamp(float(score), 300.0, 850.0))

    # Score transformation: higher scores should rapidly reduce default odds.
    # At ~650 score we get around neutral odds before other adjustments.
    score_component = (650 - safe_score) / 58.0

    risk_component = {
        "LOW": -0.45,
        "MEDIUM": 0.15,
        "HIGH": 0.65,
    }.get(str(risk_category or "").upper(), 0.0)

    utilization_component = 0.0
    if utilization_pct is not None:
        util = _clamp(float(utilization_pct), 0.0, 100.0)
        # Non-linear penalty beyond healthy utilization levels.
        if util <= 30:
            utilization_component = -0.15
        elif util <= 50:
            utilization_component = -0.02
        elif util <= 75:
            utilization_component = 0.18
        else:
            utilization_component = 0.35

    linear_risk = score_component + risk_component + utilization_component
    probability = 1.0 / (1.0 + math.exp(-linear_risk))

    # Keep away from absolute 0/1 to reflect uncertainty in sparse data.
    return round(_clamp(probability, 0.01, 0.95), 4)


def as_percentage(probability: float) -> float:
    return round(float(probability) * 100, 2)