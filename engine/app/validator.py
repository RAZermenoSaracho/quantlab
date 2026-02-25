import ast
from typing import Dict, Any, Set

from .spec import load_config_from_env


ALLOWED_RETURN_VALUES = {"BUY", "SELL", "HOLD"}

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
}


class AlgorithmValidationError(Exception):
    pass


# =========================================================
# AST SECURITY CHECKS
# =========================================================

def _check_forbidden_imports(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise AlgorithmValidationError("Imports are not allowed in the algorithm.")


def _check_no_infinite_loops(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.While):
            raise AlgorithmValidationError("While loops are not allowed.")


def _check_forbidden_calls(tree: ast.AST):
    # block obvious escape hatches
    forbidden_calls = {
        "exec", "eval", "open", "__import__", "compile", "input",
        "globals", "locals", "vars", "getattr", "setattr", "delattr",
        "dir", "help"
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                raise AlgorithmValidationError(f"Use of '{node.func.id}' is not allowed.")


def _check_forbidden_names(tree: ast.AST):
    # prevent direct access to builtins dict and other internals
    forbidden_names = {"__builtins__", "__loader__", "__spec__", "__package__"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in forbidden_names:
            raise AlgorithmValidationError(f"Access to '{node.id}' is not allowed.")


def _check_no_dunder_attribute_access(tree: ast.AST):
    """
    Prevent common sandbox escapes like:
    ().__class__.__mro__ ...
    """
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            attr = node.attr or ""
            if "__" in attr:
                raise AlgorithmValidationError("Dunder attribute access is not allowed.")


# =========================================================
# CONFIG AST VALIDATION
# =========================================================

def _validate_config_ast(tree: ast.AST):
    """
    Validate CONFIG structure using AST before execution.
    Only allow dict literal with allowed keys.
    """

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "CONFIG":

                    if not isinstance(node.value, ast.Dict):
                        raise AlgorithmValidationError(
                            "CONFIG must be defined as a dictionary literal."
                        )

                    # keys must be string literals + allowed
                    for key in node.value.keys:
                        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                            raise AlgorithmValidationError("CONFIG keys must be string literals.")

                        if key.value not in ALLOWED_CONFIG_FIELDS:
                            raise AlgorithmValidationError(f"Invalid CONFIG field: '{key.value}'")

                    # values must be simple literals (numbers, strings, None, bool)
                    for value in node.value.values:
                        if not isinstance(value, (ast.Constant, ast.UnaryOp)):
                            raise AlgorithmValidationError(
                                "CONFIG values must be simple literals (numbers, strings, booleans, None)."
                            )


# =========================================================
# SAFE EXECUTION ENVIRONMENT
# =========================================================

def _mean(values):
    return sum(values) / len(values) if values else 0.0

def _stdev(values):
    if not values or len(values) < 2:
        return 0.0
    m = _mean(values)
    var = sum((x - m) * (x - m) for x in values) / (len(values) - 1)
    return var ** 0.5

def _clamp(x, lo, hi):
    return max(lo, min(hi, x))

def _pct_change(current, previous):
    if previous in (0, None):
        return 0.0
    return ((current - previous) / previous) * 100.0

def _zscore(x, values):
    if not values:
        return 0.0
    m = _mean(values)
    s = _stdev(values)
    if s == 0:
        return 0.0
    return (x - m) / s


SAFE_GLOBALS = {
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
    },
    # basic stats helpers
    "mean": _mean,
    "stdev": _stdev,
    "clamp": _clamp,
    "pct_change": _pct_change,
    "zscore": _zscore,
}


# =========================================================
# MAIN VALIDATOR
# =========================================================

def validate_algorithm(code: str) -> Dict[str, Any]:
    """
    Validates user algorithm code safely.
    - Security AST checks
    - CONFIG AST validation
    - Execution test
    - CONFIG semantic validation
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
    execution_env = SAFE_GLOBALS.copy()
    try:
        exec(code, execution_env, execution_env)
    except Exception as e:
        raise AlgorithmValidationError(f"Execution error: {str(e)}")

    # 5) Validate generate_signal exists and is callable
    if "generate_signal" not in execution_env:
        raise AlgorithmValidationError("Function 'generate_signal' not found.")

    if not callable(execution_env["generate_signal"]):
        raise AlgorithmValidationError("'generate_signal' is not callable.")

    # 6) Validate CONFIG semantically (optional)
    config_used: Dict[str, Any] = {}
    if "CONFIG" in execution_env:
        try:
            cfg, raw = load_config_from_env(execution_env)
            config_used = raw
        except Exception as e:
            raise AlgorithmValidationError(f"Invalid CONFIG: {str(e)}")

    # 7) Test execution
    test_candle = {
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
        "timestamp": 1234567890,
    }

    try:
        result = execution_env["generate_signal"](test_candle)
    except Exception as e:
        raise AlgorithmValidationError(f"Error when calling generate_signal: {str(e)}")

    if result not in ALLOWED_RETURN_VALUES:
        raise AlgorithmValidationError(
            f"generate_signal must return one of {ALLOWED_RETURN_VALUES}"
        )

    return {
        "valid": True,
        "message": "Algorithm is valid.",
        "config": config_used,
    }