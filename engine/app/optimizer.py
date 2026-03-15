from __future__ import annotations

import copy
import logging
from itertools import product
from typing import Any, Dict, Optional

from .backtest import prepare_backtest_market_data, run_backtest
from .clients import ExchangeFactory
from .spec import load_config_from_env
from .validator import SAFE_GLOBALS


MAX_OPTIMIZER_COMBINATIONS = 20
logger = logging.getLogger("quantlab.optimizer")


def generate_param_grid(
    param_space: Dict[str, list[Any]],
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
        param_values.append(list(values))

    total_generated = 1
    for values in param_values:
        total_generated *= len(values)

    truncated = total_generated > max_combinations
    combinations: list[Dict[str, Any]] = []

    for combo_values in product(*param_values):
        combinations.append(dict(zip(param_names, combo_values)))
        if len(combinations) >= max_combinations:
            break

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
    if not base_params:
        raise ValueError("CONFIG['params'] must define at least one parameter to optimize")

    invalid_keys = [name for name in param_space.keys() if name not in base_params]
    if invalid_keys:
        raise ValueError(
            f"Optimizer can only override CONFIG['params'] keys. Invalid keys: {', '.join(invalid_keys)}"
        )

    param_grid, combinations_generated, truncated = generate_param_grid(param_space)
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
    for index, params in enumerate(param_grid):
        logger.info(
            "Running optimizer combination %s/%s: %s",
            index + 1,
            len(param_grid),
            params,
        )
        indicator_series_copy = copy.deepcopy(symbol_indicator_series)

        try:
            logger.debug("Calling run_backtest with params: %s", params)
            backtest_result = run_backtest(
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
            logger.debug("Backtest completed successfully")
        except Exception:
            logger.exception("Optimizer run failed for params: %s", params)
            raise

        results.append(
            {
                "params": dict(params),
                "metrics": _extract_metrics(backtest_result),
                "analysis": backtest_result.get("analysis"),
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
                "params": item["params"],
                "metrics": item["metrics"],
                "analysis": item.get("analysis"),
            }
        )

    return {
        "results": ranked_results,
        "combinations_generated": int(combinations_generated),
        "combinations_evaluated": int(len(ranked_results)),
        "truncated": bool(truncated),
    }
