import ast
from typing import Dict, Any

from .spec import load_config_from_env


ALLOWED_RETURN_VALUES = {"BUY", "SELL", "HOLD"}


class AlgorithmValidationError(Exception):
    pass


# ==============================
# AST SECURITY CHECKS
# ==============================

def _check_forbidden_imports(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise AlgorithmValidationError("Imports are not allowed in the algorithm.")


def _check_no_infinite_loops(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.While):
            raise AlgorithmValidationError("While loops are not allowed.")


def _check_forbidden_calls(tree: ast.AST):
    forbidden_calls = {"exec", "eval", "open", "__import__", "compile", "input"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in forbidden_calls:
                    raise AlgorithmValidationError(f"Use of '{node.func.id}' is not allowed.")


# ==============================
# SAFE EXECUTION ENVIRONMENT
# ==============================
SAFE_GLOBALS = {
    "__builtins__": {
        # numeric + iteration
        "abs": abs,
        "min": min,
        "max": max,
        "sum": sum,
        "len": len,
        "range": range,
        "round": round,

        # basic types
        "float": float,
        "int": int,
        "bool": bool,
        "str": str,
        "dict": dict,
        "list": list,
        "set": set,
        "tuple": tuple,
    },
    # helper functions available to strategies
    "mean": lambda values: sum(values) / len(values) if values else 0,
}

# ==============================
# MAIN VALIDATOR
# ==============================

def validate_algorithm(code: str) -> Dict[str, Any]:
    """
    Validates user algorithm code safely.
    - Security AST checks
    - Can execute with SAFE_GLOBALS
    - Ensures generate_signal exists and returns valid values
    - If CONFIG exists, validates it and returns it for UX
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

    # 3) Create isolated execution environment
    execution_env = SAFE_GLOBALS.copy()

    try:
        exec(code, execution_env, execution_env)
    except Exception as e:
        raise AlgorithmValidationError(f"Execution error: {str(e)}")

    # 4) Validate function existence
    if "generate_signal" not in execution_env:
        raise AlgorithmValidationError("Function 'generate_signal' not found.")

    if not callable(execution_env["generate_signal"]):
        raise AlgorithmValidationError("'generate_signal' is not callable.")

    # 5) Validate CONFIG if present (optional)
    config_used: Dict[str, Any] = {}
    if "CONFIG" in execution_env:
        try:
            _cfg, raw = load_config_from_env(execution_env)
            config_used = raw
        except Exception as e:
            raise AlgorithmValidationError(f"Invalid CONFIG: {str(e)}")

    # 6) Test execution
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
        raise AlgorithmValidationError(f"generate_signal must return one of {ALLOWED_RETURN_VALUES}")

    return {
        "valid": True,
        "message": "Algorithm is valid.",
        "config": config_used,  # helpful for UI docs + preview
    }
