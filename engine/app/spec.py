from dataclasses import dataclass, asdict
from typing import Optional, Any, Dict, Literal


BatchSizeType = Literal["fixed", "percent_balance"]


@dataclass
class AlgorithmConfig:
    """
    Strategy execution configuration.

    All fields are optional from user side via CONFIG dict.
    Defaults preserve current engine behavior.
    """

    # Risk management
    max_account_exposure_pct: float = 100.0  # % of initial_balance allowed to be used
    max_open_positions: int = 1

    # Position sizing
    batch_size: float = 1.0
    batch_size_type: BatchSizeType = "fixed"  # fixed | percent_balance

    # Trade control
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    cooldown_seconds: int = 0

    # Future-ready (not enforced yet in your backtest loop)
    max_drawdown_pct: Optional[float] = None


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def validate_config(config: AlgorithmConfig) -> None:
    # max_account_exposure_pct
    if not _is_number(config.max_account_exposure_pct):
        raise ValueError("max_account_exposure_pct must be a number")
    if not (0 < float(config.max_account_exposure_pct) <= 100):
        raise ValueError("max_account_exposure_pct must be between 0 and 100")

    # max_open_positions
    if not isinstance(config.max_open_positions, int):
        raise ValueError("max_open_positions must be an integer")
    if config.max_open_positions <= 0:
        raise ValueError("max_open_positions must be >= 1")

    # batch_size
    if not _is_number(config.batch_size):
        raise ValueError("batch_size must be a number")
    if float(config.batch_size) <= 0:
        raise ValueError("batch_size must be > 0")

    # batch_size_type
    if config.batch_size_type not in ("fixed", "percent_balance"):
        raise ValueError("batch_size_type must be 'fixed' or 'percent_balance'")

    if config.batch_size_type == "percent_balance":
        if float(config.batch_size) > 100:
            raise ValueError("batch_size must be <= 100 when batch_size_type='percent_balance'")

    # stop_loss_pct / take_profit_pct
    if config.stop_loss_pct is not None:
        if not _is_number(config.stop_loss_pct):
            raise ValueError("stop_loss_pct must be a number")
        if float(config.stop_loss_pct) <= 0:
            raise ValueError("stop_loss_pct must be > 0")

    if config.take_profit_pct is not None:
        if not _is_number(config.take_profit_pct):
            raise ValueError("take_profit_pct must be a number")
        if float(config.take_profit_pct) <= 0:
            raise ValueError("take_profit_pct must be > 0")

    # cooldown_seconds
    if not isinstance(config.cooldown_seconds, int):
        raise ValueError("cooldown_seconds must be an integer")
    if config.cooldown_seconds < 0:
        raise ValueError("cooldown_seconds must be >= 0")

    # max_drawdown_pct (future)
    if config.max_drawdown_pct is not None:
        if not _is_number(config.max_drawdown_pct):
            raise ValueError("max_drawdown_pct must be a number")
        if not (0 < float(config.max_drawdown_pct) <= 100):
            raise ValueError("max_drawdown_pct must be between 0 and 100")


def load_config_from_env(execution_env: Dict[str, Any]) -> tuple[AlgorithmConfig, Dict[str, Any]]:
    """
    Reads CONFIG dict from user code execution environment and returns:
    - AlgorithmConfig instance (with defaults applied)
    - raw user dict used (for returning/persisting)
    """
    raw = execution_env.get("CONFIG", {})

    if raw is None:
        raw = {}

    if not isinstance(raw, dict):
        raise ValueError("CONFIG must be a dict")

    try:
        cfg = AlgorithmConfig(**raw)
    except TypeError as e:
        # e.g. unknown key
        raise ValueError(f"Invalid CONFIG fields: {str(e)}")

    validate_config(cfg)
    return cfg, raw


def config_to_dict(cfg: AlgorithmConfig) -> Dict[str, Any]:
    return asdict(cfg)
