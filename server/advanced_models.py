"""Modelli pesanti: StatsForecast + Prophet. Import opzionali."""
from __future__ import annotations


def installed() -> dict:
    out = {"statsforecast": False, "prophet": False}
    try:
        import statsforecast  # noqa: F401
        out["statsforecast"] = True
    except Exception:
        pass
    try:
        import prophet  # noqa: F401
        out["prophet"] = True
    except Exception:
        pass
    return out


def _freq(season: int) -> str:
    if season >= 48:
        return "W"
    if season == 7:
        return "D"
    if season == 4:
        return "QS"
    return "MS"


def _sf_forecast(values, season, periods, model) -> list:
    import pandas as pd
    from statsforecast import StatsForecast

    n = len(values)
    freq = _freq(season)
    df = pd.DataFrame(
        {
            "unique_id": ["s"] * n,
            "ds": pd.date_range("2018-01-01", periods=n, freq=freq),
            "y": [float(v) for v in values],
        }
    )
    sf = StatsForecast(models=[model], freq=freq, n_jobs=1)
    fc = sf.forecast(df=df, h=int(periods))
    col = [c for c in fc.columns if c not in ("unique_id", "ds")][0]
    return [max(0.0, round(float(x), 2)) for x in fc[col].tolist()]


def builder_autoarima(season: int):
    from statsforecast.models import AutoARIMA

    sl = int(season) if season and season >= 2 else 1

    def fn(values, periods, sl=sl):
        return _sf_forecast(values, sl, periods, AutoARIMA(season_length=sl))

    return fn


def builder_autoets(season: int):
    from statsforecast.models import AutoETS

    sl = int(season) if season and season >= 2 else 1

    def fn(values, periods, sl=sl):
        return _sf_forecast(values, sl, periods, AutoETS(season_length=sl))

    return fn


def builder_autotheta(season: int):
    from statsforecast.models import AutoTheta

    sl = int(season) if season and season >= 2 else 1

    def fn(values, periods, sl=sl):
        return _sf_forecast(values, sl, periods, AutoTheta(season_length=sl))

    return fn


def builder_mstl(season: int):
    from statsforecast.models import AutoETS, MSTL

    sl = int(season) if season and season >= 2 else 12

    def fn(values, periods, sl=sl):
        seasons = [sl]
        if sl == 12 and len(values) >= 80:
            seasons = [12]
        model = MSTL(season_length=seasons, trend_forecaster=AutoETS(model="ZZN"))
        return _sf_forecast(values, sl, periods, model)

    return fn


def builder_prophet(season: int):
    import pandas as pd
    from prophet import Prophet

    sl = int(season) if season and season >= 2 else 12
    freq = _freq(sl)

    def fn(values, periods, sl=sl, freq=freq):
        n = len(values)
        df = pd.DataFrame(
            {
                "ds": pd.date_range("2018-01-01", periods=n, freq=freq),
                "y": [float(v) for v in values],
            }
        )
        m = Prophet(
            yearly_seasonality=sl == 12 or sl >= 48,
            weekly_seasonality=sl == 7 or sl >= 48,
            daily_seasonality=False,
            seasonality_mode="additive",
        )
        m.fit(df, iter=200)
        future = m.make_future_dataframe(periods=int(periods), freq=freq)
        hat = m.predict(future)["yhat"].tolist()[n:]
        return [max(0.0, round(float(x), 2)) for x in hat]

    return fn


def advanced_builders(season: int, n_points: int) -> dict:
    """Ritorna {nome: fn(values, periods)} solo per i pacchetti installati."""
    out = {}
    info = installed()
    if info["statsforecast"] and n_points >= 10:
        try:
            out["AutoARIMA"] = builder_autoarima(season)
        except Exception:
            pass
        try:
            out["AutoETS"] = builder_autoets(season)
        except Exception:
            pass
        try:
            out["AutoTheta"] = builder_autotheta(season)
        except Exception:
            pass
        if n_points >= 24:
            try:
                out["MSTL"] = builder_mstl(season)
            except Exception:
                pass
    if info["prophet"] and n_points >= 16:
        try:
            out["Prophet"] = builder_prophet(season)
        except Exception:
            pass
    return out
