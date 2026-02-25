from dataclasses import dataclass, asdict
from typing import Optional, Any, Dict, Literal


BatchSizeType = Literal["fixed", "percent_balance"]
DirectionType = Literal["long_only", "long_short"]
OrderType = Literal["market", "limit"]
SignalModeType = Literal[
    "mean_reversion",
    "trend_following",
    "volatility_breakout",
    "rsi_reversion",
]


# =========================================================
# CONFIG DATACLASS
# =========================================================

@dataclass
class AlgorithmConfig:
    """
    QuantLab Strategy Execution Configuration (SaaS-grade)

    Design principles:
    - Minimal hard constraints
    - Strategy-mode aware validation
    - Flexible warmup handling
    - Production-ready structure
    """

    # Versioning
    spec_version: int = 2

    # ============================
    # Risk Management
    # ============================
    max_account_exposure_pct: float = 100.0
    max_open_positions: int = 1
    max_drawdown_pct: Optional[float] = None

    # ============================
    # Position Sizing
    # ============================
    batch_size: float = 1.0
    batch_size_type: BatchSizeType = "fixed"

    # ============================
    # Trade Control
    # ============================
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    cooldown_seconds: int = 0
    allow_reentry: bool = True

    # ============================
    # Execution
    # ============================
    direction: DirectionType = "long_only"
    order_type: OrderType = "market"
    slippage_bps: float = 0.0

    # ============================
    # Warmup & Windows
    # ============================
    min_bars: int = 30
    lookback_window: int = 20
    volume_window: int = 20
    volatility_window: int = 20
    fast_ma_window: int = 10
    slow_ma_window: int = 50
    rsi_window: int = 14

    # ============================
    # Strategy Family
    # ============================
    signal_mode: SignalModeType = "mean_reversion"

    # ============================
    # Thresholds
    # ============================
    return_threshold_pct: float = -1.0
    exit_return_threshold_pct: float = 1.0
    volume_spike_threshold_pct: float = 20.0
    zscore_entry_threshold: float = -1.5
    zscore_exit_threshold: float = 0.0
    volatility_breakout_pct: float = 2.0

    # ============================
    # RSI
    # ============================
    rsi_entry_threshold: float = 30.0
    rsi_exit_threshold: float = 60.0

    # ============================
    # Filters
    # ============================
    trend_filter: bool = False
    require_volume_confirmation: bool = True
    require_return_confirmation: bool = True


# =========================================================
# HELPERS
# =========================================================

def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)

def _is_bool(x: Any) -> bool:
    return isinstance(x, bool)


# =========================================================
# VALIDATION
# =========================================================

def validate_config(config: AlgorithmConfig) -> None:

    # -----------------------------
    # Basic type safety
    # -----------------------------
    if not isinstance(config.spec_version, int) or config.spec_version <= 0:
        raise ValueError("spec_version must be a positive integer")

    if not _is_number(config.max_account_exposure_pct) or not (0 < config.max_account_exposure_pct <= 100):
        raise ValueError("max_account_exposure_pct must be between 0 and 100")

    if not isinstance(config.max_open_positions, int) or config.max_open_positions <= 0:
        raise ValueError("max_open_positions must be >= 1")

    if not _is_number(config.batch_size) or config.batch_size <= 0:
        raise ValueError("batch_size must be > 0")

    if config.batch_size_type not in ("fixed", "percent_balance"):
        raise ValueError("batch_size_type invalid")

    if config.batch_size_type == "percent_balance" and config.batch_size > 100:
        raise ValueError("batch_size must be <= 100 for percent_balance")

    if not isinstance(config.cooldown_seconds, int) or config.cooldown_seconds < 0:
        raise ValueError("cooldown_seconds must be >= 0")

    if not _is_number(config.slippage_bps) or not (0 <= config.slippage_bps <= 500):
        raise ValueError("slippage_bps must be between 0 and 500")

    # -----------------------------
    # Stop / TP validation
    # -----------------------------
    for field in ("stop_loss_pct", "take_profit_pct", "trailing_stop_pct"):
        val = getattr(config, field)
        if val is not None and (not _is_number(val) or val <= 0):
            raise ValueError(f"{field} must be > 0")

    # -----------------------------
    # Window validation (no rigidity)
    # -----------------------------
    for field in (
        "min_bars",
        "lookback_window",
        "volume_window",
        "volatility_window",
        "fast_ma_window",
        "slow_ma_window",
        "rsi_window",
    ):
        val = getattr(config, field)
        if not isinstance(val, int) or val <= 0:
            raise ValueError(f"{field} must be an integer > 0")

    if config.slow_ma_window <= config.fast_ma_window:
        raise ValueError("slow_ma_window must be > fast_ma_window")

    # IMPORTANT:
    # We no longer force min_bars >= max(windows)
    # Let the strategy logic handle warmup internally

    # -----------------------------
    # Strategy-specific validation
    # -----------------------------

    if config.signal_mode == "trend_following":
        if config.fast_ma_window >= config.slow_ma_window:
            raise ValueError("trend_following requires fast_ma_window < slow_ma_window")

    if config.signal_mode == "rsi_reversion":
        if not (0 <= config.rsi_entry_threshold <= 100):
            raise ValueError("rsi_entry_threshold must be 0-100")
        if not (0 <= config.rsi_exit_threshold <= 100):
            raise ValueError("rsi_exit_threshold must be 0-100")

    # -----------------------------
    # Threshold sanity
    # -----------------------------
    for field in (
        "return_threshold_pct",
        "exit_return_threshold_pct",
        "volume_spike_threshold_pct",
        "zscore_entry_threshold",
        "zscore_exit_threshold",
        "volatility_breakout_pct",
    ):
        if not _is_number(getattr(config, field)):
            raise ValueError(f"{field} must be numeric")

    # -----------------------------
    # Boolean toggles
    # -----------------------------
    for field in (
        "allow_reentry",
        "trend_filter",
        "require_volume_confirmation",
        "require_return_confirmation",
    ):
        if not _is_bool(getattr(config, field)):
            raise ValueError(f"{field} must be boolean")


# =========================================================
# LOADER
# =========================================================

def load_config_from_env(execution_env: Dict[str, Any]) -> tuple[AlgorithmConfig, Dict[str, Any]]:

    raw = execution_env.get("CONFIG", {})

    if raw is None:
        raw = {}

    if not isinstance(raw, dict):
        raise ValueError("CONFIG must be a dict")

    try:
        cfg = AlgorithmConfig(**raw)
    except TypeError as e:
        raise ValueError(f"Invalid CONFIG fields: {str(e)}")

    validate_config(cfg)
    return cfg, raw


def config_to_dict(cfg: AlgorithmConfig) -> Dict[str, Any]:
    return asdict(cfg)
