"""
Base Scenario Test Harness for BlackTrader PAMM Suite
Standardizes execution, assertion logging, duration measurement, and deep bug capture.
"""

import time
import traceback
from typing import Dict, Any, List, Optional
from core.config import Config
from core.api_client import PlatformAPIClient, APIResponse
from core.math_engine import PAMMMathEngine
from core.state_manager import StateManager
from core.bug_tracker import BugTracker

class TestResult:
    def __init__(
        self,
        tc_id: str,
        title: str,
        priority: str,
        module_num: int,
        status: str,  # "PASS", "FAIL", "DEFECT", "NOTICE", "ERROR"
        duration_ms: float,
        logs: List[str],
        error: Optional[str] = None,
        bug_id: Optional[str] = None,
        policy_notice: Optional[str] = None
    ):
        self.tc_id = tc_id
        self.title = title
        self.priority = priority
        self.module_num = module_num
        self.status = status
        self.duration_ms = duration_ms
        self.logs = logs
        self.error = error
        self.bug_id = bug_id
        self.policy_notice = policy_notice

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tc_id": self.tc_id,
            "title": self.title,
            "priority": self.priority,
            "module_num": self.module_num,
            "status": self.status,
            "duration_ms": round(self.duration_ms, 2),
            "logs": self.logs,
            "error": self.error,
            "bug_id": self.bug_id,
            "policy_notice": self.policy_notice,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

class BasePAMMScenario:
    def __init__(
        self,
        tc_id: str,
        title: str,
        priority: str,
        module_num: int,
        description: str = "",
        client: Optional[PlatformAPIClient] = None,
        bug_tracker: Optional[BugTracker] = None,
        state_mgr: Optional[StateManager] = None,
        math_engine: Optional[PAMMMathEngine] = None
    ):
        self.tc_id = tc_id
        self.title = title
        self.priority = priority
        self.module_num = module_num
        self.description = description
        
        self.client = client or PlatformAPIClient()
        self.bug_tracker = bug_tracker or BugTracker()
        self.state_mgr = state_mgr or StateManager()
        self.math = math_engine or PAMMMathEngine()
        
        self.logs: List[str] = []

    def log(self, message: str):
        ts = time.strftime("%H:%M:%S")
        self.logs.append(f"[{ts}] {message}")

    def setup(self):
        """Prepare preconditions."""
        pass

    def execute(self) -> Dict[str, Any]:
        """Perform genuine actions against BlackTrader API or simulated bridge."""
        raise NotImplementedError

    def verify(self, execution_output: Dict[str, Any]) -> bool:
        """Evaluate assertions against specs."""
        raise NotImplementedError

    def teardown(self):
        """Clean up post-test state."""
        pass

    def run(self) -> TestResult:
        start_time = time.perf_counter()
        bug_id = None
        error_msg = None
        policy_notice = None
        status = "FAIL"

        try:
            self.log(f"Starting test scenario {self.tc_id}: '{self.title}' ({self.priority})")
            self.setup()
            res = self.execute()
            
            # Check if execution flagged an expected platform policy notice
            if res.get("policy_notice"):
                notice_info = res["policy_notice"]
                policy_notice = notice_info.get("message", "Platform policy restriction noted.")
                status = "NOTICE"
                self.log(f"ℹ️ Platform Policy Notice (Expected restriction, not an error): {policy_notice}")
            # Check if execution itself flagged a known platform bug
            elif res.get("bug_detected"):
                bug_info = res["bug_detected"]
                bug_rec = self.bug_tracker.record_bug(
                    bug_id=bug_info.get("bug_id", f"BUG-{self.tc_id}"),
                    scenario_id=self.tc_id,
                    title=bug_info.get("title", self.title),
                    category=bug_info.get("category", "Functional Defect"),
                    severity=self.priority,
                    endpoint=bug_info.get("endpoint", "/"),
                    observed_behavior=bug_info.get("observed", "Defect observed during execution"),
                    expected_behavior=bug_info.get("expected", "Expected compliant behavior"),
                    root_cause=bug_info.get("root_cause", "Engine failure"),
                    request_payload=bug_info.get("payload"),
                    response_status=bug_info.get("status_code"),
                    response_body=bug_info.get("response_body")
                )
                bug_id = bug_rec["bug_id"]
                status = "DEFECT"
                self.log(f"⚠️ Platform Bug Captured: {bug_id} - {bug_info.get('title')}")
            else:
                passed = self.verify(res)
                if passed:
                    status = "PASS"
                    self.log(f"✅ Scenario assertions verified successfully.")
                else:
                    status = "FAIL"
                    self.log(f"❌ Scenario assertions failed.")
        except Exception as e:
            status = "ERROR"
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.log(f"💥 Exception in execution: {error_msg}")
            self.log(traceback.format_exc())
        finally:
            try:
                self.teardown()
            except Exception:
                pass
            duration_ms = (time.perf_counter() - start_time) * 1000.0

        return TestResult(
            tc_id=self.tc_id,
            title=self.title,
            priority=self.priority,
            module_num=self.module_num,
            status=status,
            duration_ms=duration_ms,
            logs=self.logs,
            error=error_msg,
            bug_id=bug_id,
            policy_notice=policy_notice
        )

