"""
Replay Bundle Emitter for BlackTrader PAMM Race Conditions
Captures: seed, scenario id, iteration #, offset bucket, ordered op log with ns timestamps,
HTTP bodies, S0/S1 snapshots, DB lock status, and timing metrics.
"""
import os
import json
import time
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super(DecimalEncoder, self).default(obj)

class ReplayBundleEmitter:
    def __init__(self, output_dir=None):
        if output_dir is None:
            output_dir = os.path.join(os.path.dirname(__file__), "data", "replay_bundles")
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def emit(self, scenario_id, iteration, offset_ms, seed, op_log, s0, s1, invariants_failed, extra=None):
        """
        Emits a standalone replay bundle JSON file.
        """
        timestamp_str = time.strftime("%Y%m%d_%H%M%S")
        bundle_id = f"replay_{scenario_id}_iter{iteration}_{timestamp_str}"
        file_path = os.path.join(self.output_dir, f"{bundle_id}.json")

        bundle = {
            "bundle_id": bundle_id,
            "scenario_id": scenario_id,
            "iteration": iteration,
            "offset_ms": offset_ms,
            "seed": seed,
            "timestamp": time.time(),
            "invariants_failed": invariants_failed,
            "operation_log": op_log,
            "snapshot_before_s0": s0,
            "snapshot_after_s1": s1,
            "extra_diagnostics": extra or {}
        }

        with open(file_path, "w") as f:
            json.dump(bundle, f, indent=2, cls=DecimalEncoder)

        return file_path, bundle
