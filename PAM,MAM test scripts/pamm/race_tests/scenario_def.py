"""
BlackTrader PAMM - Scenario Definition Base
Standard interface for all 114 race scenarios.
"""
from decimal import Decimal
import time
import random
from .harness import RaceResult

class BaseRaceScenario:
    def __init__(self, scenario_id, name, priority, race_classes, hardens_tcs, description):
        self.scenario_id = scenario_id
        self.name = name
        self.priority = priority          # P0, P1, P2
        self.race_classes = race_classes  # ["TOCTOU", "LOST-UPDATE", ...]
        self.hardens_tcs = hardens_tcs    # ["BTPAMM-F007", ...]
        self.description = description

    def execute(self, harness, iterations=10):
        """
        Executes the scenario using the harness and returns a RaceResult.
        Subclasses override run_iteration or run_custom.
        """
        raise NotImplementedError("Subclasses must implement execute()")

    def to_dict(self):
        return {
            "scenario_id": self.scenario_id,
            "name": self.name,
            "priority": self.priority,
            "race_classes": self.race_classes,
            "hardens_tcs": self.hardens_tcs,
            "description": self.description
        }
