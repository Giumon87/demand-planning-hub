"""Motore di previsione lato server, solo libreria standard."""
from __future__ import annotations


def _round(x: float) -> float:
    return round(max(0.0, float(x)), 2)


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def seasonal_scale(values, season: int) -> float:
    s = season if season >= 2 else 1
    if len(values) <= s:
        diffs = [abs(values[i] - values[i - 1]) for i in range(1, len(values))]
        return _mean(diffs) or 1.0
    diffs = [abs(values[i] - values[i - s]) for i in range(s, len(values))]
    return _mean(diffs) or 1.0


def mape(actual, pred) -> float:
    parts = []
    for a, p in zip(actual, pred):
        if a:
            parts.append(abs(a - p) / abs(a))
    return round(100.0 * _mean(parts), 1) if parts else 999.0


def mase(actual, pred, scale: float) -> float:
    if not actual or not scale:
        return 999.0
    err = sum(abs(a - p) for a, p in zip(actual, pred)) / len(actual)
    return round(err / scale, 3)


def seasonal_naive(values, season, periods):
    s = max(1, season)
    out = []
    for i in range(periods):
        src = values[-s + (i % s)] if len(values) >= s else values[-1]
        out.append(_round(src))
    return out


def seasonal_ma(values, season, window, periods):
    s = max(1, season)
    out = []
    for i in range(periods):
        bucket = [values[j] for j in range(len(values)) if (len(values) + i - j) % s == 0]
        bucket = bucket[-max(1, window) :]
        out.append(_round(_mean(bucket) if bucket else values[-1]))
    return out


def holt_winters_add(values, season, periods, alpha, beta, gamma):
    s = max(2, season)
    n = len(values)
    if n < s + 2:
        return seasonal_naive(values, s, periods)
    level = _mean(values[:s])
    trend = (_mean(values[s : 2 * s]) - level) / s if n >= 2 * s else 0.0
    seas = [values[i] - level for i in range(s)]
    for t in range(n):
        x = values[t]
        last_level = level
        season_t = seas[t % s]
        level = alpha * (x - season_t) + (1 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
        seas[t % s] = gamma * (x - last_level) + (1 - gamma) * season_t
    out = []
    for h in range(1, periods + 1):
        out.append(_round(level + h * trend + seas[(n + h - 1) % s]))
    return out


def holt_winters_mul(values, season, periods, alpha, beta, gamma):
    s = max(2, season)
    n = len(values)
    if n < s + 2 or any(v <= 0 for v in values):
        return holt_winters_add(values, s, periods, alpha, beta, gamma)
    level = _mean(values[:s]) or 1.0
    trend = (_mean(values[s : 2 * s]) - level) / s if n >= 2 * s else 0.0
    seas = [values[i] / level for i in range(s)]
    for t in range(n):
        x = values[t]
        last_level = level
        season_t = seas[t % s] or 1.0
        level = alpha * (x / season_t) + (1 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
        seas[t % s] = gamma * (x / (last_level or 1.0)) + (1 - gamma) * season_t
    out = []
    for h in range(1, periods + 1):
        out.append(_round((level + h * trend) * (seas[(n + h - 1) % s] or 1.0)))
    return out


def croston(values, periods, alpha=0.3):
    """Domanda intermittente (molti zeri)."""
    a = 0.0
    p = 1.0
    q = 1.0
    started = False
    for x in values:
        if x > 0:
            if not started:
                a, p, started = x, q, True
            else:
                a = alpha * x + (1 - alpha) * a
                p = alpha * q + (1 - alpha) * p
            q = 1.0
        else:
            q += 1.0
    rate = (a / p) if p else 0.0
    return [_round(rate) for _ in range(periods)]


def theta_like(values, season, periods):
    n = len(values)
    if n < 4:
        return seasonal_naive(values, season, periods)
    xs = list(range(n))
    xbar = _mean(xs)
    ybar = _mean(values)
    den = sum((x - xbar) ** 2 for x in xs) or 1.0
    slope = sum((xs[i] - xbar) * (values[i] - ybar) for i in range(n)) / den
    intercept = ybar - slope * xbar
    s = max(1, season)
    seas = []
    for k in range(s):
        bucket = [values[i] - (intercept + slope * i) for i in range(n) if i % s == k]
        seas.append(_mean(bucket) if bucket else 0.0)
    out = []
    for h in range(1, periods + 1):
        t = n + h - 1
        out.append(_round(intercept + slope * t + seas[t % s]))
    return out


def zero_share(values) -> float:
    if not values:
        return 0.0
    return sum(1 for v in values if v <= 0) / len(values)


def auto_forecast(values, season: int, periods: int) -> dict:
    values = [float(v) for v in values if v is not None]
    season = int(season) if season and season >= 2 else (12 if len(values) >= 24 else 1)
    periods = max(1, min(int(periods or 12), 36))
    if len(values) < 4:
        fc = seasonal_naive(values or [0], season, periods)
        return {"forecast": fc, "best": "Copia stagione", "rows": [{"name": "Copia stagione", "mase": None, "mape": None}]}

    h = min(max(3, len(values) // 4), season if season >= 2 else 6, 8)
    train, test = values[:-h], values[-h:]
    scale = seasonal_scale(train, season)
    candidates = {}

    if zero_share(values) >= 0.35:
        candidates["Croston (intermittente)"] = lambda tr, p: croston(tr, p)

    candidates["Copia stagione"] = lambda tr, p: seasonal_naive(tr, season, p)
    candidates["Media stagionale"] = lambda tr, p: seasonal_ma(tr, season, 3, p)
    candidates["Theta + stagione"] = lambda tr, p: theta_like(tr, season, p)

    grid = (0.2, 0.4, 0.6)
    best_add = None
    best_mul = None
    best_add_err = 1e9
    best_mul_err = 1e9
    for a in grid:
        for b in grid:
            for g in grid:
                pred_a = holt_winters_add(train, season, h, a, b, g)
                err_a = mase(test, pred_a, scale)
                if err_a < best_add_err:
                    best_add_err, best_add = err_a, (a, b, g)
                pred_m = holt_winters_mul(train, season, h, a, b, g)
                err_m = mase(test, pred_m, scale)
                if err_m < best_mul_err:
                    best_mul_err, best_mul = err_m, (a, b, g)
    if best_add:
        aa, bb, gg = best_add
        candidates["Holt-Winters auto add"] = lambda tr, p, aa=aa, bb=bb, gg=gg: holt_winters_add(tr, season, p, aa, bb, gg)
    if best_mul:
        aa, bb, gg = best_mul
        candidates["Holt-Winters auto mul"] = lambda tr, p, aa=aa, bb=bb, gg=gg: holt_winters_mul(tr, season, p, aa, bb, gg)

    try:
        from advanced_models import advanced_builders

        candidates.update(advanced_builders(season, len(values)))
    except Exception:
        pass

    rows = []
    fits = {}
    by_name = {}
    for name, fn in candidates.items():
        try:
            pred = fn(train, h)
            full = fn(values, periods)
            label = "Server · " + name
            fits[name] = fn
            by_name[label] = full
            rows.append({"name": label, "mase": mase(test, pred, scale), "mape": mape(test, pred)})
        except Exception:
            continue
    rows.sort(key=lambda r: r["mase"] if r["mase"] is not None else 999)
    if not rows:
        fc = seasonal_naive(values, season, periods)
        return {"forecast": fc, "best": "Copia stagione", "rows": [], "by_name": {}}

    best_label = rows[0]["name"].replace("Server · ", "")
    forecast = fits[best_label](values, periods)
    if len(rows) >= 2 and rows[0]["mase"] and rows[1]["mase"] / rows[0]["mase"] <= 1.12:
        other = rows[1]["name"].replace("Server · ", "")
        fc2 = fits[other](values, periods)
        forecast = [_round(0.6 * forecast[i] + 0.4 * fc2[i]) for i in range(periods)]
        mix_name = "Server · " + best_label + " + " + other
        by_name[mix_name] = forecast
        best_label = best_label + " + " + other
    return {"forecast": forecast, "best": "Server · " + best_label, "rows": rows[:14], "by_name": by_name}
