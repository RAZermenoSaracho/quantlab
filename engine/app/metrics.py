from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import sqrt
from statistics import mean, pstdev
from typing import Any, Dict, List, Optional, Tuple, Union


EquityPoint = Union[float, int, Dict[str, Any]]
Trade = Dict[str, Any]


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except Exception:
        return default


def _parse_ts(ts: Any) -> Optional[datetime]:
    """
    Supports:
    - ms epoch (int/float)
    - seconds epoch (int/float but small)
    - iso string
    """
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            # Heuristic: Binance kline open time is ms epoch
            if ts > 10_000_000_000:  # > ~2286 in seconds, so likely ms
                return datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(ts, str):
            # Try ISO first
            try:
                # Handles "2026-02-17 10:30:05" and ISO variants
                s = ts.replace("Z", "+00:00")
                return datetime.fromisoformat(s).astimezone(timezone.utc)
            except Exception:
                return None
    except Exception:
        return None
    return None


def _normalize_equity_curve(equity_curve: List[EquityPoint]) -> Tuple[List[float], List[Optional[datetime]]]:
    equities: List[float] = []
    times: List[Optional[datetime]] = []

    for p in equity_curve:
        if isinstance(p, (int, float)):
            equities.append(float(p))
            times.append(None)
        elif isinstance(p, dict):
            eq = _safe_float(p.get("equity", p.get("value", p.get("close", 0.0))), 0.0)
            ts = _parse_ts(p.get("timestamp") or p.get("time") or p.get("t"))
            equities.append(eq)
            times.append(ts)
        else:
            equities.append(_safe_float(p, 0.0))
            times.append(None)

    return equities, times


def _periods_per_year(timeframe: str) -> float:
    """
    Rough annualization factors for common crypto timeframes.
    Used for Sharpe/Sortino/Vol annualization.
    """
    tf = (timeframe or "").strip().lower()
    mapping = {
        "1m": 525600,
        "3m": 175200,
        "5m": 105120,
        "15m": 35040,
        "30m": 17520,
        "1h": 8760,
        "2h": 4380,
        "4h": 2190,
        "6h": 1460,
        "8h": 1095,
        "12h": 730,
        "1d": 365,
        "3d": 122,
        "1w": 52,
        "1mo": 12,
    }
    return float(mapping.get(tf, 365.0))  # sensible default: daily-ish


def _compute_returns(equities: List[float]) -> List[float]:
    if len(equities) < 2:
        return []
    rets: List[float] = []
    prev = equities[0]
    for e in equities[1:]:
        if prev == 0:
            rets.append(0.0)
        else:
            rets.append((e / prev) - 1.0)
        prev = e
    return rets


def _drawdown_curve(equities: List[float]) -> Tuple[List[float], float]:
    """
    Returns: (dd_series as negative values, max_dd as positive fraction)
    dd value is (equity - peak)/peak => <= 0
    """
    if not equities:
        return [], 0.0

    peak = equities[0]
    dd_series: List[float] = []
    max_dd = 0.0  # positive fraction

    for e in equities:
        if e > peak:
            peak = e
        dd = (e - peak) / peak if peak else 0.0  # negative/zero
        dd_series.append(dd)
        max_dd = max(max_dd, -dd)

    return dd_series, max_dd


def _max_drawdown_duration(dd_series: List[float]) -> int:
    """
    Duration (in bars) of longest drawdown spell (time underwater).
    dd_series <= 0.
    """
    max_dur = 0
    cur = 0
    for dd in dd_series:
        if dd < 0:
            cur += 1
            if cur > max_dur:
                max_dur = cur
        else:
            cur = 0
    return max_dur


def _sharpe(returns: List[float], periods_per_year: float, risk_free_rate: float = 0.0) -> float:
    if not returns:
        return 0.0
    if len(returns) < 2:
        return 0.0

    rf_per_period = risk_free_rate / periods_per_year
    excess = [r - rf_per_period for r in returns]
    vol = pstdev(excess)
    if vol == 0:
        return 0.0
    return (mean(excess) / vol) * sqrt(periods_per_year)


def _sortino(returns: List[float], periods_per_year: float, risk_free_rate: float = 0.0) -> float:
    if not returns or len(returns) < 2:
        return 0.0
    rf_per_period = risk_free_rate / periods_per_year
    excess = [r - rf_per_period for r in returns]
    downside = [r for r in excess if r < 0]
    if len(downside) < 2:
        return 0.0
    downside_dev = pstdev(downside)
    if downside_dev == 0:
        return 0.0
    return (mean(excess) / downside_dev) * sqrt(periods_per_year)


def _volatility(returns: List[float], periods_per_year: float) -> float:
    if not returns or len(returns) < 2:
        return 0.0
    return pstdev(returns) * sqrt(periods_per_year)


def _cagr(initial: float, final: float, start_ts: Optional[datetime], end_ts: Optional[datetime]) -> float:
    if initial <= 0 or final <= 0:
        return 0.0
    if not start_ts or not end_ts:
        return 0.0
    delta_days = (end_ts - start_ts).total_seconds() / 86400.0
    if delta_days <= 0:
        return 0.0
    years = delta_days / 365.0
    return (final / initial) ** (1.0 / years) - 1.0


def _group_monthly_returns(equities: List[float], times: List[Optional[datetime]]) -> List[Dict[str, Any]]:
    """
    Returns list like:
    [{ "month": "2026-02", "return_pct": 3.21, "start_equity":..., "end_equity":... }, ...]
    Only works if timestamps exist.
    """
    if not equities or not times or all(t is None for t in times):
        return []

    # pair only points with valid timestamps
    points: List[Tuple[datetime, float]] = []
    for t, e in zip(times, equities):
        if t is not None:
            points.append((t, e))

    if len(points) < 2:
        return []

    points.sort(key=lambda x: x[0])
    buckets: Dict[str, List[float]] = {}

    for t, e in points:
        key = f"{t.year:04d}-{t.month:02d}"
        buckets.setdefault(key, []).append(e)

    out: List[Dict[str, Any]] = []
    for key in sorted(buckets.keys()):
        vals = buckets[key]
        start = float(vals[0])
        end = float(vals[-1])
        ret = ((end / start) - 1.0) * 100.0 if start else 0.0
        out.append(
            {
                "month": key,
                "return_pct": ret,
                "start_equity": start,
                "end_equity": end,
            }
        )
    return out


def _trade_stats(trades: List[Trade], initial_balance: float) -> Dict[str, Any]:
    total_trades = len(trades)
    pnls: List[float] = []
    wins: List[float] = []
    losses: List[float] = []

    for t in trades:
        # support various keys:
        pnl = _safe_float(
            t.get("pnl")
            or t.get("net_pnl")
            or t.get("profit")
            or t.get("profit_usdt"),
            0.0,
        )
        pnls.append(pnl)
        if pnl > 0:
            wins.append(pnl)
        elif pnl < 0:
            losses.append(pnl)

    win_rate = (len(wins) / total_trades) if total_trades else 0.0
    loss_rate = 1.0 - win_rate if total_trades else 0.0

    gross_profit = sum(wins)
    gross_loss = abs(sum(losses)) if losses else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else 0.0

    avg_trade = mean(pnls) if pnls else 0.0
    avg_win = mean(wins) if wins else 0.0
    avg_loss = abs(mean(losses)) if losses else 0.0

    # Expectancy (in USDT)
    expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)

    # Payoff ratio
    payoff_ratio = (avg_win / avg_loss) if avg_loss > 0 else 0.0

    # Biggest win/loss
    largest_win = max(wins) if wins else 0.0
    largest_loss = min(losses) if losses else 0.0  # negative

    return {
        "total_trades": total_trades,
        "win_rate": win_rate,
        "loss_rate": loss_rate,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "avg_trade": avg_trade,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "expectancy": expectancy,
        "payoff_ratio": payoff_ratio,
        "largest_win": largest_win,
        "largest_loss": largest_loss,
    }


def calculate_metrics(
    *,
    equity_curve: List[EquityPoint],
    trades: List[Trade],
    initial_balance: float,
    timeframe: str,
    risk_free_rate: float = 0.0,
) -> Dict[str, Any]:
    """
    Main entry point.

    Supports equity_curve formats:
      - [10000.0, 10010.2, ...]
      - [{"timestamp": 1700000000000, "equity": 10000.0}, ...]
    """
    equities, times = _normalize_equity_curve(equity_curve)
    if not equities:
        # minimal return
        return {
            "summary": {
                "net_profit": 0.0,
                "return_pct": 0.0,
                "cagr": 0.0,
            },
            "risk": {
                "sharpe": 0.0,
                "sortino": 0.0,
                "volatility": 0.0,
                "max_drawdown_pct": 0.0,
                "max_drawdown_duration": 0,
                "calmar": 0.0,
            },
            "consistency": {
                "win_rate": 0.0,
                "avg_win": 0.0,
                "avg_loss": 0.0,
                "profit_factor": 0.0,
                "expectancy": 0.0,
                "total_trades": 0,
            },
            "time_analysis": {
                "monthly_returns": [],
            },
            "drawdown_curve": [],
            "returns_series": [],
        }

    final_equity = float(equities[-1])
    net_profit = final_equity - float(initial_balance)
    return_pct = (net_profit / float(initial_balance)) * 100.0 if initial_balance else 0.0

    returns = _compute_returns(equities)
    ppy = _periods_per_year(timeframe)

    dd_series, max_dd = _drawdown_curve(equities)
    max_dd_duration = _max_drawdown_duration(dd_series)

    vol = _volatility(returns, ppy)
    sharpe = _sharpe(returns, ppy, risk_free_rate)
    sortino = _sortino(returns, ppy, risk_free_rate)

    # CAGR only if we have timestamps
    start_ts = next((t for t in times if t is not None), None)
    end_ts = next((t for t in reversed(times) if t is not None), None)
    cagr = _cagr(float(initial_balance), final_equity, start_ts, end_ts)

    calmar = (cagr / max_dd) if max_dd > 0 else 0.0

    tstats = _trade_stats(trades, float(initial_balance))

    monthly = _group_monthly_returns(equities, times)

    # Consistency pack (some duplicates intentionally for UI convenience)
    consistency = {
        "total_trades": int(tstats["total_trades"]),
        "win_rate": float(tstats["win_rate"]),
        "loss_rate": float(tstats["loss_rate"]),
        "avg_trade": float(tstats["avg_trade"]),
        "avg_win": float(tstats["avg_win"]),
        "avg_loss": float(tstats["avg_loss"]),
        "gross_profit": float(tstats["gross_profit"]),
        "gross_loss": float(tstats["gross_loss"]),
        "profit_factor": float(tstats["profit_factor"]),
        "expectancy": float(tstats["expectancy"]),
        "payoff_ratio": float(tstats["payoff_ratio"]),
        "largest_win": float(tstats["largest_win"]),
        "largest_loss": float(tstats["largest_loss"]),
    }

    summary = {
        "initial_balance": float(initial_balance),
        "final_balance": final_equity,
        "net_profit": float(net_profit),
        "return_pct": float(return_pct),
        "cagr": float(cagr),
    }

    risk = {
        "sharpe": float(sharpe),
        "sortino": float(sortino),
        "volatility": float(vol),
        "max_drawdown_pct": float(max_dd * 100.0),
        "max_drawdown_duration": int(max_dd_duration),
        "calmar": float(calmar),
    }

    # Store drawdown as pct for UI friendliness
    drawdown_curve_pct = [float(dd * 100.0) for dd in dd_series]
    returns_series_pct = [float(r * 100.0) for r in returns]

    return {
        "summary": summary,
        "risk": risk,
        "consistency": consistency,
        "time_analysis": {
            "monthly_returns": monthly,
        },
        "drawdown_curve": drawdown_curve_pct,
        "returns_series": returns_series_pct,
    }
