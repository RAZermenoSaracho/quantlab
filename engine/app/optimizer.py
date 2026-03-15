from __future__ import annotations

import copy
import logging
import random
from itertools import product
from typing import Any, Dict, Optional

from .backtest import prepare_backtest_market_data, run_backtest
from .clients import ExchangeFactory
from .spec import load_config_from_env
from .validator import SAFE_GLOBALS


MAX_OPTIMIZER_COMBINATIONS = 20
MAX_JS_SAFE_INTEGER = 9_007_199_254_740_991
logger = logging.getLogger("quantlab.optimizer")


def _normalize_numeric_candidate(value: Any, template: Any) -> Any:
    if isinstance(template, int) and not isinstance(template, bool):
        return int(round(float(value)))
    return float(value)


def _build_local_candidates(
    values: list[Any],
    current_value: Any,
) -> list[Any]:
    numeric_values = [
        value for value in values
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    ]
    if not numeric_values:
        return list(dict.fromkeys(values))

    sorted_values = sorted(float(value) for value in numeric_values)
    min_value = sorted_values[0]
    max_value = sorted_values[-1]
    unique_sorted_values = sorted(set(sorted_values))

    if len(unique_sorted_values) >= 2:
        step = min(
            upper - lower
            for lower, upper in zip(unique_sorted_values, unique_sorted_values[1:])
            if (upper - lower) > 0
        )
    else:
        step = 0.0

    if isinstance(current_value, (int, float)) and not isinstance(current_value, bool):
        center = float(current_value)
    else:
        center = unique_sorted_values[min(len(unique_sorted_values) // 2, len(unique_sorted_values) - 1)]

    if step <= 0:
        clamped_center = min(max(center, min_value), max_value)
        return [_normalize_numeric_candidate(clamped_center, current_value if current_value is not None else values[0])]

    candidates = [
        min(max(center - step, min_value), max_value),
        min(max(center, min_value), max_value),
        min(max(center + step, min_value), max_value),
    ]

    normalized_candidates: list[Any] = []
    seen: set[Any] = set()
    template = current_value if current_value is not None else values[0]
    for candidate in candidates:
        normalized = _normalize_numeric_candidate(candidate, template)
        if normalized in seen:
            continue
        seen.add(normalized)
        normalized_candidates.append(normalized)

    return normalized_candidates


def generate_local_param_grid(
    param_space: Dict[str, list[Any]],
    baseline_params: Dict[str, Any],
    *,
    max_combinations: int = MAX_OPTIMIZER_COMBINATIONS,
) -> tuple[list[Dict[str, Any]], int, bool]:
    if not isinstance(param_space, dict) or not param_space:
        raise ValueError("param_space must be a non-empty dictionary")

    param_names = list(param_space.keys())
    param_values: list[list[Any]] = []

    for name in param_names:
        values = param_space.get(name)
        if not isinstance(name, str) or not name.strip():
            raise ValueError("param_space keys must be non-empty strings")
        if not isinstance(values, list) or not values:
            raise ValueError(f"param_space['{name}'] must be a non-empty list")
        param_values.append(
            _build_local_candidates(
                list(values),
                baseline_params.get(name),
            )
        )

    total_generated = 1
    for values in param_values:
        total_generated *= len(values)

    truncated = total_generated > max_combinations
    all_combinations = [
        dict(zip(param_names, combo_values))
        for combo_values in product(*param_values)
    ]

    combinations = list(all_combinations)
    if truncated:
        sampler = random.Random(0)
        sampled_indexes = sorted(sampler.sample(range(len(all_combinations)), max_combinations))
        combinations = [all_combinations[index] for index in sampled_indexes]

    return combinations, total_generated, truncated


def _extract_metrics(backtest_result: Dict[str, Any]) -> Dict[str, float]:
    analysis = backtest_result.get("analysis") or {}
    risk = analysis.get("risk") or {}

    return {
        "total_return_percent": float(backtest_result.get("total_return_percent", 0.0) or 0.0),
        "total_return_usdt": float(backtest_result.get("total_return_usdt", 0.0) or 0.0),
        "max_drawdown_percent": float(backtest_result.get("max_drawdown_percent", 0.0) or 0.0),
        "win_rate_percent": float(backtest_result.get("win_rate_percent", 0.0) or 0.0),
        "profit_factor": float(backtest_result.get("profit_factor", 0.0) or 0.0),
        "total_trades": float(backtest_result.get("total_trades", 0.0) or 0.0),
        "sharpe_ratio": float(risk.get("sharpe", 0.0) or 0.0),
        "volatility": float(risk.get("volatility", 0.0) or 0.0),
    }


def _log_optimizer_candle_summary(
    *,
    label: str,
    symbol: str,
    timeframe: str,
    symbol_candles: Dict[str, list[dict[str, float]]],
) -> None:
    first_ts = None
    last_ts = None
    total_candles = 0

    for candles in symbol_candles.values():
        if not candles:
            continue
        total_candles += len(candles)
        candle_first_ts = int(candles[0]["timestamp"])
        candle_last_ts = int(candles[-1]["timestamp"])
        first_ts = candle_first_ts if first_ts is None else min(first_ts, candle_first_ts)
        last_ts = candle_last_ts if last_ts is None else max(last_ts, candle_last_ts)

    logger.info(
        "%s symbol=%s timeframe=%s candle_count=%s first_ts=%s last_ts=%s",
        label,
        symbol,
        timeframe,
        total_candles,
        first_ts,
        last_ts,
    )


def _log_optimizer_result_summary(
    *,
    label: str,
    backtest_result: Dict[str, Any],
) -> None:
    metrics = _extract_metrics(backtest_result)
    logger.info(
        "%s config_used=%s",
        label,
        backtest_result.get("config_used"),
    )
    logger.info(
        "%s total_return_percent=%s total_return_usdt=%s total_trades=%s "
        "win_rate_percent=%s max_drawdown_percent=%s profit_factor=%s",
        label,
        metrics["total_return_percent"],
        metrics["total_return_usdt"],
        metrics["total_trades"],
        metrics["win_rate_percent"],
        metrics["max_drawdown_percent"],
        metrics["profit_factor"],
    )


def _run_standard_optimizer_baseline_backtest(
    strategy_code: str,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str,
    fee_rate: Optional[float],
    api_key: Optional[str],
    api_secret: Optional[str],
    testnet: bool,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    return run_backtest(
        code=strategy_code,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        initial_balance=initial_balance,
        start_date=start_date,
        end_date=end_date,
        fee_rate=fee_rate,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
        override_params=params,
    )


def _compare_optimizer_baseline_paths(
    strategy_code: str,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str,
    fee_rate: Optional[float],
    api_key: Optional[str],
    api_secret: Optional[str],
    testnet: bool,
    params: Dict[str, Any],
    symbol_candles: Dict[str, list[dict[str, float]]],
    symbol_indicator_series: Dict[str, Dict[str, list[Any]]],
) -> Dict[str, Any]:
    logger.info(
        "Optimizer baseline inputs exchange=%s symbol=%s timeframe=%s start=%s end=%s "
        "initial_balance=%s fee_rate=%s params=%s",
        exchange,
        symbol,
        timeframe,
        start_date,
        end_date,
        initial_balance,
        fee_rate,
        dict(params),
    )
    _log_optimizer_candle_summary(
        label="Optimizer baseline candle summary",
        symbol=symbol,
        timeframe=timeframe,
        symbol_candles=symbol_candles,
    )

    standard_result = _run_standard_optimizer_baseline_backtest(
        strategy_code,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        initial_balance=initial_balance,
        start_date=start_date,
        end_date=end_date,
        fee_rate=fee_rate,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
        params=params,
    )
    _log_optimizer_result_summary(
        label="Optimizer baseline result",
        backtest_result=standard_result,
    )

    override_result = _run_optimizer_backtest(
        strategy_code,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        initial_balance=initial_balance,
        start_date=start_date,
        end_date=end_date,
        fee_rate=fee_rate,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
        params=params,
        symbol_candles=symbol_candles,
        symbol_indicator_series=symbol_indicator_series,
    )
    _log_optimizer_result_summary(
        label="Optimizer override comparison result",
        backtest_result=override_result,
    )

    standard_metrics = _extract_metrics(standard_result)
    override_metrics = _extract_metrics(override_result)
    metric_keys = (
        "total_return_percent",
        "total_return_usdt",
        "total_trades",
        "win_rate_percent",
        "max_drawdown_percent",
        "profit_factor",
    )
    differences = {
        key: override_metrics[key] - standard_metrics[key]
        for key in metric_keys
        if abs(override_metrics[key] - standard_metrics[key]) > 1e-9
    }
    if differences:
        logger.warning(
            "Optimizer baseline path mismatch detected: %s",
            differences,
        )

    return standard_result


def _run_optimizer_backtest(
    strategy_code: str,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str,
    fee_rate: Optional[float],
    api_key: Optional[str],
    api_secret: Optional[str],
    testnet: bool,
    params: Dict[str, Any],
    symbol_candles: Dict[str, list[dict[str, float]]],
    symbol_indicator_series: Dict[str, Dict[str, list[Any]]],
) -> Dict[str, Any]:
    indicator_series_copy = copy.deepcopy(symbol_indicator_series)

    return run_backtest(
        code=strategy_code,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        initial_balance=initial_balance,
        start_date=start_date,
        end_date=end_date,
        fee_rate=fee_rate,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
        override_params=params,
        candles_override=symbol_candles,
        indicator_series_override=indicator_series_copy,
    )


def run_optimizer(
    strategy_code: str,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str,
    param_space: Dict[str, list[Any]],
    fee_rate: Optional[float] = None,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    testnet: bool = False,
) -> Dict[str, Any]:
    logger.info("Optimizer started for %s %s %s", exchange, symbol, timeframe)

    execution_env = SAFE_GLOBALS.copy()
    exec(strategy_code, execution_env, execution_env)

    if "generate_signal" not in execution_env:
        raise Exception("generate_signal not defined")

    config, _ = load_config_from_env(execution_env)
    base_params = dict(getattr(config, "params", {}) or {})
    if not isinstance(param_space, dict) or not param_space:
        raise ValueError("Optimizer requires at least one parameter range")

    param_grid, combinations_generated, truncated = generate_local_param_grid(
        param_space,
        base_params,
    )
    logger.info(
        "Optimizer generated %s combinations (evaluating %s)",
        combinations_generated,
        len(param_grid),
    )

    client = ExchangeFactory.create(
        exchange=exchange,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
    )
    logger.info("Fetching candles for optimizer run")
    _, symbol_candles, symbol_indicator_series, _, _ = prepare_backtest_market_data(
        client=client,
        symbol=symbol,
        timeframe=timeframe,
        start_date=start_date,
        end_date=end_date,
        config=config,
    )
    total_candles_loaded = sum(len(candles) for candles in symbol_candles.values())
    logger.info(
        "Loaded %s candles for optimizer",
        total_candles_loaded,
    )

    results: list[Dict[str, Any]] = []
    logger.info("Running optimizer baseline with current strategy params")
    baseline_backtest_result = _compare_optimizer_baseline_paths(
        strategy_code,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        initial_balance=initial_balance,
        start_date=start_date,
        end_date=end_date,
        fee_rate=fee_rate,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
        params=base_params,
        symbol_candles=symbol_candles,
        symbol_indicator_series=symbol_indicator_series,
    )
    results.append(
        {
            "params": dict(base_params),
            "metrics": _extract_metrics(baseline_backtest_result),
            "analysis": baseline_backtest_result.get("analysis"),
            "is_baseline": True,
        }
    )

    for index, params in enumerate(param_grid):
        logger.info(
            "Running optimizer combination %s/%s: %s",
            index + 1,
            len(param_grid),
            params,
        )
        try:
            logger.debug("Calling run_backtest with params: %s", params)
            backtest_result = _run_optimizer_backtest(
                strategy_code,
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
                initial_balance=initial_balance,
                start_date=start_date,
                end_date=end_date,
                fee_rate=fee_rate,
                api_key=api_key,
                api_secret=api_secret,
                testnet=testnet,
                params=params,
                symbol_candles=symbol_candles,
                symbol_indicator_series=symbol_indicator_series,
            )
            logger.debug("Backtest completed successfully")
        except Exception:
            logger.exception("Optimizer run failed for params: %s", params)
            raise

        results.append(
            {
                "params": dict(params),
                "metrics": _extract_metrics(backtest_result),
                "analysis": backtest_result.get("analysis"),
                "is_baseline": False,
            }
        )

    ranked = sorted(
        results,
        key=lambda item: (
            float(item["metrics"].get("sharpe_ratio", 0.0) or 0.0),
            float(item["metrics"].get("total_return_percent", 0.0) or 0.0),
        ),
        reverse=True,
    )

    ranked_results: list[Dict[str, Any]] = []
    for index, item in enumerate(ranked, start=1):
        ranked_results.append(
            {
                "rank": index,
                "is_baseline": bool(item.get("is_baseline", False)),
                "params": item["params"],
                "metrics": item["metrics"],
                "analysis": item.get("analysis"),
            }
        )

    return {
        "results": ranked_results,
        "combinations_generated": int(min(combinations_generated, MAX_JS_SAFE_INTEGER)),
        "combinations_evaluated": int(len(ranked_results)),
        "truncated": bool(truncated),
    }
