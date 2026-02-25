import ast
from dataclasses import dataclass
from typing import Dict, Any, Set, List, Optional
import math as _py_math  # engine-side import OK

from .spec import load_config_from_env
from .indicators import compute_indicator_series
from .context import build_context


# =========================================================
# SIGNALS (v4)
# =========================================================

# Canonical signals: LONG / SHORT / CLOSE / HOLD
# Backward compatibility: BUY / SELL
ALLOWED_RETURN_VALUES = {
    "LONG",
    "SHORT",
    "CLOSE",
    "HOLD",
    "BUY",
    "SELL",
}

CANONICAL_RETURN_VALUES = {"LONG", "SHORT", "CLOSE", "HOLD"}


# =========================================================
# CONFIG FIELDS (v4)
# =========================================================

ALLOWED_CONFIG_FIELDS: Set[str] = {
    # versioning
    "spec_version",
    # risk
    "max_account_exposure_pct",
    "max_open_positions",
    "max_drawdown_pct",
    # sizing
    "batch_size",
    "batch_size_type",
    # trade control
    "stop_loss_pct",
    "take_profit_pct",
    "trailing_stop_pct",
    "cooldown_seconds",
    "allow_reentry",
    # execution
    "direction",
    "order_type",
    "slippage_bps",
    # windows
    "min_bars",
    "lookback_window",
    "volume_window",
    "volatility_window",
    # mode
    "signal_mode",
    # thresholds
    "return_threshold_pct",
    "exit_return_threshold_pct",
    "volume_spike_threshold_pct",
    "zscore_entry_threshold",
    "zscore_exit_threshold",
    "volatility_breakout_pct",
    # trend
    "fast_ma_window",
    "slow_ma_window",
    "trend_filter",
    # rsi
    "rsi_window",
    "rsi_entry_threshold",
    "rsi_exit_threshold",
    # filters
    "require_volume_confirmation",
    "require_return_confirmation",
    # execution advanced
    "execution_model",
    "stop_fill_model",
    # leverage / margin
    "leverage",
    "margin_mode",
}


class AlgorithmValidationError(Exception):
    pass


# =========================================================
# AST SECURITY CHECKS
# =========================================================

def _check_forbidden_imports(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise AlgorithmValidationError("Imports are not allowed in the algorithm.")


def _check_no_infinite_loops(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.While):
            raise AlgorithmValidationError("While loops are not allowed.")


def _check_forbidden_calls(tree: ast.AST) -> None:
    forbidden_calls = {
        "exec", "eval", "open", "__import__", "compile", "input",
        "globals", "locals", "vars", "getattr", "setattr", "delattr",
        "dir", "help",
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                raise AlgorithmValidationError(f"Use of '{node.func.id}' is not allowed.")


def _check_forbidden_names(tree: ast.AST) -> None:
    forbidden_names = {"__builtins__", "__loader__", "__spec__", "__package__"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in forbidden_names:
            raise AlgorithmValidationError(f"Access to '{node.id}' is not allowed.")


def _check_no_dunder_attribute_access(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            attr = node.attr or ""
            if "__" in attr:
                raise AlgorithmValidationError("Dunder attribute access is not allowed.")


# =========================================================
# CONFIG AST VALIDATION
# =========================================================

def _validate_config_ast(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue

        for target in node.targets:
            if not (isinstance(target, ast.Name) and target.id == "CONFIG"):
                continue

            if not isinstance(node.value, ast.Dict):
                raise AlgorithmValidationError("CONFIG must be defined as a dictionary literal.")

            for key in node.value.keys:
                if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                    raise AlgorithmValidationError("CONFIG keys must be string literals.")
                if key.value not in ALLOWED_CONFIG_FIELDS:
                    raise AlgorithmValidationError(f"Invalid CONFIG field: '{key.value}'")

            for value in node.value.values:
                if not isinstance(value, (ast.Constant, ast.UnaryOp)):
                    raise AlgorithmValidationError(
                        "CONFIG values must be simple literals (numbers, strings, booleans, None)."
                    )


# =========================================================
# SAFE QUANT TOOLKIT
# =========================================================

def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _stdev(values: List[float]) -> float:
    if not values or len(values) < 2:
        return 0.0
    m = _mean(values)
    var = sum((x - m) * (x - m) for x in values) / (len(values) - 1)
    return var ** 0.5


def _variance(values: List[float]) -> float:
    if not values or len(values) < 2:
        return 0.0
    m = _mean(values)
    return sum((x - m) ** 2 for x in values) / (len(values) - 1)


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if (n % 2 == 1) else (s[mid - 1] + s[mid]) / 2.0


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _pct_change(current: Optional[float], previous: Optional[float]) -> float:
    if previous in (0, None) or current is None:
        return 0.0
    return ((current - previous) / previous) * 100.0


def _zscore(x: float, values: List[float]) -> float:
    if not values:
        return 0.0
    m = _mean(values)
    s = _stdev(values)
    if s == 0:
        return 0.0
    return (x - m) / s


def _rolling_mean(values: List[float], window: int) -> Optional[float]:
    if window <= 0 or len(values) < window:
        return None
    return _mean(values[-window:])


def _rolling_std(values: List[float], window: int) -> Optional[float]:
    if window <= 1 or len(values) < window:
        return None
    return _stdev(values[-window:])


def _percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    p = _clamp(float(p), 0.0, 1.0)
    s = sorted(values)
    idx = int(round((len(s) - 1) * p))
    idx = int(_clamp(idx, 0, len(s) - 1))
    return s[idx]


def _ewma(values: List[float], alpha: float) -> float:
    if not values:
        return 0.0
    a = _clamp(float(alpha), 0.0, 1.0)
    out = float(values[0])
    for v in values[1:]:
        out = a * float(v) + (1.0 - a) * out
    return out


def _correlation(x: List[float], y: List[float]) -> float:
    if not x or not y or len(x) != len(y) or len(x) < 2:
        return 0.0
    mx, my = _mean(x), _mean(y)
    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    den = _stdev(x) * _stdev(y)
    return (num / den) if den else 0.0


# =========================================================
# SAFE MATH (NO CRASH)
# =========================================================

def _nan() -> float:
    return float("nan")


@dataclass(frozen=True)
class _SafeMath:
    """
    Safe math proxy:
    - uses real python math for accuracy
    - NEVER raises for domain/overflow; returns NaN instead
    """
    pi: float = _py_math.pi
    e: float = _py_math.e
    tau: float = _py_math.tau

    @staticmethod
    def isnan(x: float) -> bool:
        try:
            return _py_math.isnan(float(x))
        except Exception:
            return True

    @staticmethod
    def isfinite(x: float) -> bool:
        try:
            return _py_math.isfinite(float(x))
        except Exception:
            return False

    @staticmethod
    def fabs(x: float) -> float:
        try:
            return _py_math.fabs(float(x))
        except Exception:
            return _nan()

    @staticmethod
    def sqrt(x: float) -> float:
        try:
            return _py_math.sqrt(float(x))
        except Exception:
            return _nan()

    @staticmethod
    def exp(x: float) -> float:
        try:
            return _py_math.exp(float(x))
        except Exception:
            return _nan()

    @staticmethod
    def log(x: float, base: Optional[float] = None) -> float:
        try:
            xv = float(x)
            if base is None:
                return _py_math.log(xv)
            bv = float(base)
            return _py_math.log(xv, bv)
        except Exception:
            # critical: prevent "math.log domain error" from crashing strategies
            return _nan()

    @staticmethod
    def floor(x: float) -> int:
        try:
            return int(_py_math.floor(float(x)))
        except Exception:
            return 0

    @staticmethod
    def ceil(x: float) -> int:
        try:
            return int(_py_math.ceil(float(x)))
        except Exception:
            return 0

    @staticmethod
    def pow(x: float, y: float) -> float:
        try:
            return _py_math.pow(float(x), float(y))
        except Exception:
            return _nan()


# =========================================================
# SAFE EXECUTION ENVIRONMENT
# =========================================================

SAFE_GLOBALS: Dict[str, Any] = {
    "__builtins__": {
        "abs": abs,
        "min": min,
        "max": max,
        "sum": sum,
        "len": len,
        "range": range,
        "round": round,
        "float": float,
        "int": int,
        "bool": bool,
        "str": str,
        "dict": dict,
        "list": list,
        "set": set,
        "tuple": tuple,
        "enumerate": enumerate,
        "zip": zip,
        "sorted": sorted,
        "reversed": reversed,
        "all": all,
        "any": any,
    },

    # math (no import needed)
    "math": _SafeMath(),

    # stats
    "mean": _mean,
    "stdev": _stdev,
    "variance": _variance,
    "median": _median,
    "clamp": _clamp,
    "pct_change": _pct_change,
    "zscore": _zscore,

    # quant toolkit
    "rolling_mean": _rolling_mean,
    "rolling_std": _rolling_std,
    "percentile": _percentile,
    "ewma": _ewma,
    "correlation": _correlation,
}


# =========================================================
# TEST DATA BUILDER (for validation only)
# =========================================================

def _build_dummy_candles(count: int, timeframe: str = "1h") -> List[dict]:
    step_ms = 3_600_000 if timeframe.endswith("h") else 60_000
    candles: List[dict] = []
    base = 100.0
    ts = 1700000000000

    for i in range(count):
        close = base + (i * 0.25)
        open_ = close - 0.10
        high = close + 0.20
        low = close - 0.30
        volume = 1000.0 + (i * 3.0)

        candles.append({
            "open": float(open_),
            "high": float(high),
            "low": float(low),
            "close": float(close),
            "volume": float(volume),
            "timestamp": ts + (i * step_ms),
        })

    return candles


# =========================================================
# SIGNAL NORMALIZATION
# =========================================================

def _normalize_signal(raw_signal: Any, direction: str) -> str:
    if raw_signal is None:
        return "HOLD"
    if not isinstance(raw_signal, str):
        raise AlgorithmValidationError("generate_signal must return a string signal.")

    s = raw_signal.strip().upper()

    if s == "BUY":
        return "LONG"
    if s == "SELL":
        return "CLOSE" if direction == "long_only" else "SHORT"

    return s


# =========================================================
# MAIN VALIDATOR
# =========================================================

def validate_algorithm(code: str) -> Dict[str, Any]:
    """
    v4 validation:
    - no imports/while/dangerous builtins
    - CONFIG dict-literal keys must be allowed
    - exposes safe math without requiring import
    - if algorithm crashes on math domain or division during validation, we default sample to HOLD and warn
    """

    # 1) Parse AST
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise AlgorithmValidationError(f"Syntax error: {str(e)}")

    # 2) Security checks
    _check_forbidden_imports(tree)
    _check_no_infinite_loops(tree)
    _check_forbidden_calls(tree)
    _check_forbidden_names(tree)
    _check_no_dunder_attribute_access(tree)

    # 3) CONFIG AST validation
    _validate_config_ast(tree)

    # 4) Execute safely
    execution_env: Dict[str, Any] = dict(SAFE_GLOBALS)
    try:
        exec(code, execution_env, execution_env)
    except Exception as e:
        raise AlgorithmValidationError(f"Execution error: {str(e)}")

    # 5) generate_signal exists
    fn = execution_env.get("generate_signal")
    if fn is None:
        raise AlgorithmValidationError("Function 'generate_signal' not found.")
    if not callable(fn):
        raise AlgorithmValidationError("'generate_signal' is not callable.")

    # 6) CONFIG load
    try:
        cfg, raw_cfg = load_config_from_env(execution_env)
    except Exception as e:
        raise AlgorithmValidationError(f"Invalid CONFIG: {str(e)}")

    # 7) Build context
    required_bars = max(
        10,
        int(getattr(cfg, "min_bars", 30)),
        int(getattr(cfg, "lookback_window", 20)),
        int(getattr(cfg, "volatility_window", 20)),
        int(getattr(cfg, "rsi_window", 14)),
        int(getattr(cfg, "fast_ma_window", 10)),
        int(getattr(cfg, "slow_ma_window", 50)),
    ) + 10

    candles = _build_dummy_candles(required_bars, timeframe="1h")
    indicator_series = compute_indicator_series(candles, cfg)

    history_window = max(
        int(getattr(cfg, "min_bars", 30)),
        int(getattr(cfg, "slow_ma_window", 50)),
        int(getattr(cfg, "lookback_window", 20)),
        30,
    )

    ctx = build_context(
        index=len(candles) - 1,
        candles=candles,
        indicator_series=indicator_series,
        position=None,
        balance=1000.0,
        initial_balance=1000.0,
        timeframe="1h",
        history_window=history_window,
    )

    # 8) Test call (robust)
    warnings: List[str] = []
    try:
        raw_signal = fn(ctx)
    except (ZeroDivisionError,) as e:
        raw_signal = "HOLD"
        warnings.append(f"generate_signal raised ZeroDivisionError during validation; treated as HOLD. ({str(e)})")
    except ValueError as e:
        # includes "math domain error"
        raw_signal = "HOLD"
        warnings.append(f"generate_signal raised ValueError during validation; treated as HOLD. ({str(e)})")
    except Exception as e:
        raise AlgorithmValidationError(f"Error when calling generate_signal(context): {str(e)}")

    # 9) Normalize + validate
    direction = str(getattr(cfg, "direction", "long_only"))
    signal = _normalize_signal(raw_signal, direction=direction)

    if signal not in CANONICAL_RETURN_VALUES:
        if signal not in ALLOWED_RETURN_VALUES:
            raise AlgorithmValidationError(
                f"generate_signal must return one of {sorted(ALLOWED_RETURN_VALUES)} "
                f"(normalized to {sorted(CANONICAL_RETURN_VALUES)}). Got: '{raw_signal}'"
            )

    return {
        "valid": True,
        "message": "Algorithm is valid.",
        "config": raw_cfg,
        "sample_signal": signal,
        "warnings": warnings,
    }