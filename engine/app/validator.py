import ast
from typing import Dict, Any

ALLOWED_RETURN_VALUES = {"BUY", "SELL", "HOLD"}

class AlgorithmValidationError(Exception):
    pass


def _check_forbidden_imports(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom):
            raise AlgorithmValidationError("Imports are not allowed in the algorithm.")


def _check_no_infinite_loops(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.While):
            raise AlgorithmValidationError("While loops are not allowed.")


def validate_algorithm(code: str) -> Dict[str, Any]:
    """
    Validates user algorithm code.
    """

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise AlgorithmValidationError(f"Syntax error: {str(e)}")

    # Security checks
    _check_forbidden_imports(tree)
    _check_no_infinite_loops(tree)

    # Execute in restricted namespace
    local_env = {}

    try:
        exec(code, {}, local_env)
    except Exception as e:
        raise AlgorithmValidationError(f"Execution error: {str(e)}")

    if "generate_signal" not in local_env:
        raise AlgorithmValidationError("Function 'generate_signal' not found.")

    if not callable(local_env["generate_signal"]):
        raise AlgorithmValidationError("'generate_signal' is not callable.")

    # Test call with dummy candle
    test_candle = {
        "open": 100.0,
        "high": 105.0,
        "low": 95.0,
        "close": 102.0,
        "volume": 1000.0,
        "timestamp": 1234567890
    }

    try:
        result = local_env["generate_signal"](test_candle)
    except Exception as e:
        raise AlgorithmValidationError(
            f"Error when calling generate_signal: {str(e)}"
        )

    if result not in ALLOWED_RETURN_VALUES:
        raise AlgorithmValidationError(
            f"generate_signal must return one of {ALLOWED_RETURN_VALUES}"
        )

    return {
        "valid": True,
        "message": "Algorithm is valid."
    }
