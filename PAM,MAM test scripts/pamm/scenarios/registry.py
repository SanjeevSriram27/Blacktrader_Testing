"""
Unified PAMM Scenario Registry
Aggregates and indexes all 165 BlackTrader PAMM Test Scenarios across 11 modules.
"""

from typing import Dict, Any, List, Optional
from core.scenario_base import BasePAMMScenario

from scenarios.mod01_setup_lifecycle import get_module_01_scenarios
from scenarios.mod02_pool_sizing import get_module_02_scenarios
from scenarios.mod03_rollovers_nav import get_module_03_scenarios
from scenarios.mod04_order_routing import get_module_04_scenarios
from scenarios.mod05_partial_slippage import get_module_05_scenarios
from scenarios.mod06_pooled_margin_risk import get_module_06_scenarios
from scenarios.mod07_deposits_withdrawals import get_module_07_scenarios
from scenarios.mod08_hwm_settlement import get_module_08_scenarios
from scenarios.mod09_concurrency_scale import get_module_09_scenarios
from scenarios.mod10_regulatory_compliance import get_module_10_scenarios
from scenarios.mod11_operational_runbooks import get_module_11_scenarios

_MODULE_GETTERS = {
    1: get_module_01_scenarios,
    2: get_module_02_scenarios,
    3: get_module_03_scenarios,
    4: get_module_04_scenarios,
    5: get_module_05_scenarios,
    6: get_module_06_scenarios,
    7: get_module_07_scenarios,
    8: get_module_08_scenarios,
    9: get_module_09_scenarios,
    10: get_module_10_scenarios,
    11: get_module_11_scenarios,
}

def get_all_scenarios() -> List[BasePAMMScenario]:
    all_scenarios = []
    for m_num in sorted(_MODULE_GETTERS.keys()):
        all_scenarios.extend(_MODULE_GETTERS[m_num]())
    return all_scenarios

def get_scenarios_by_module(mod_num: int) -> List[BasePAMMScenario]:
    getter = _MODULE_GETTERS.get(mod_num)
    return getter() if getter else []

def get_scenario_by_id(tc_id: str) -> Optional[BasePAMMScenario]:
    tc_id_norm = tc_id.strip().upper()
    for s in get_all_scenarios():
        if s.tc_id.upper() == tc_id_norm:
            return s
    return None

def get_scenarios_by_priority(priority: str) -> List[BasePAMMScenario]:
    pri_norm = priority.strip().upper()
    return [s for s in get_all_scenarios() if pri_norm in s.priority.upper()]
