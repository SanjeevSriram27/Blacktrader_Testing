"""
Deep Defect & Bug Tracking Engine for BlackTrader Platform
Records, categorizes, formats, and exports platform bugs with reproduction payloads.
"""

import json
import time
from typing import Dict, Any, List, Optional
from core.config import Config

class BugTracker:
    def __init__(self, storage_file=Config.BUGS_FILE):
        self.storage_file = storage_file
        self.bugs: List[Dict[str, Any]] = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        if self.storage_file.exists():
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def save(self):
        self.storage_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.storage_file, "w", encoding="utf-8") as f:
            json.dump(self.bugs, f, indent=2)

    def record_bug(
        self,
        bug_id: str,
        scenario_id: str,
        title: str,
        category: str,
        severity: str,
        endpoint: str,
        observed_behavior: str,
        expected_behavior: str,
        root_cause: str,
        request_payload: Optional[Dict[str, Any]] = None,
        response_status: Optional[int] = None,
        response_body: Optional[Any] = None,
        reproduction_curl: Optional[str] = None,
        bug_type: str = "FUNCTIONALITY", # "CONSOLE" or "FUNCTIONALITY"
        screenshot: Optional[str] = None,
        status: str = "OPEN",
        resolution_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Records a new bug or updates an existing bug record."""
        # Check if already recorded
        for bug in self.bugs:
            if bug["bug_id"] == bug_id:
                bug["observed_behavior"] = observed_behavior
                bug["response_status"] = response_status
                bug["response_body"] = response_body
                bug["bug_type"] = bug_type
                bug["screenshot"] = screenshot or bug.get("screenshot")
                bug["status"] = status
                bug["resolution_notes"] = resolution_notes
                bug["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                self.save()
                return bug

        bug_record = {
            "bug_id": bug_id,
            "scenario_id": scenario_id,
            "title": title,
            "category": category,      # "API Contract", "Math & Rounding", "Auth & Session", "Financial Blocker", "Architectural Gap"
            "severity": severity,      # "P0 (Blocker)", "P1 (High)", "P2 (Medium)"
            "bug_type": bug_type,      # "CONSOLE" or "FUNCTIONALITY"
            "status": status,
            "resolution_notes": resolution_notes,
            "endpoint": endpoint,
            "request_payload": request_payload or {},
            "response_status": response_status,
            "response_body": response_body,
            "observed_behavior": observed_behavior,
            "expected_behavior": expected_behavior,
            "root_cause": root_cause,
            "screenshot": screenshot,
            "reproduction_curl": reproduction_curl or self._generate_curl(endpoint, request_payload),
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.bugs.append(bug_record)
        self.save()
        return bug_record

    def _generate_curl(self, endpoint: str, payload: Optional[Dict[str, Any]]) -> str:
        url = f"{Config.BASE_URL}{endpoint}"
        if not payload:
            return f"curl -X GET '{url}' -H 'Authorization: Bearer <TOKEN>'"
        payload_str = json.dumps(payload)
        return f"curl -X POST '{url}' -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' -d '{payload_str}'"

    def get_all(self) -> List[Dict[str, Any]]:
        return self.bugs

    def get_by_id(self, bug_id: str) -> Optional[Dict[str, Any]]:
        return next((b for b in self.bugs if b["bug_id"] == bug_id), None)

    def seed_known_platform_bugs(self):
        """Pre-seeds the verified genuine PAMM architectural and UI/console defects."""
        known = [
            {
                "bug_id": "BUG-DEP-004",
                "scenario_id": "BTPAMM-D001",
                "title": "Zero Published Deposit Payment Gateways on Client Portal",
                "category": "Financial Blocker",
                "severity": "P0 (Blocker)",
                "bug_type": "FUNCTIONALITY",
                "status": "RESOLVED",
                "resolution_notes": "Broker administrator published active deposit payment method pm_750cb53613f78d0b1c ('Test', Bank Transfer, Min $100). Live deposit submission via POST /v1/oms/real/portal/deposits ($100 with proof receipt) and backoffice admin review/approval via POST /admin/api/deposits/{id}/review verified end-to-end; funds credited directly to investor wallet.",
                "screenshot": "screenshots/bug_02_wallet_deposit_blocked.png",
                "endpoint": "GET /v1/oms/real/portal/methods",
                "request_payload": {},
                "response_status": 200,
                "response_body": {"methods": [{"currency": None, "details": {}, "kind": "bank", "method_id": "pm_750cb53613f78d0b1c", "min_deposit": 100, "name": "Test", "network": None}], "success": True},
                "observed_behavior": "Prior to fix, client portal returned empty methods list ('Your broker has not published any deposit methods yet'). After admin published payment method pm_750cb53613f78d0b1c, portal methods endpoint returns 200 OK with active Bank Transfer gateway.",
                "expected_behavior": "Active deposit methods (Bank Wire, Card, Crypto) must be configured in backoffice and returned by payment gateway.",
                "root_cause": "Broker backoffice gateway integrations were unmapped for default member tier. Admin has now published active deposit method.",
                "reproduction_curl": "curl -X GET 'https://lpadmin.blackfx.com/v1/oms/real/portal/methods' -H 'Authorization: Bearer <TOKEN>'"
            },
            {
                "bug_id": "BUG-AUTH-002",
                "scenario_id": "BTPAMM-F011",
                "title": "Premature Unauthenticated API Probing on PAMM Dock Tab Initialization",
                "category": "Auth & Session",
                "severity": "P1 (High)",
                "bug_type": "CONSOLE",
                "status": "RESOLVED",
                "resolution_notes": "Verified clean on terminal.blacktrader.com deployment. The WebTrader architecture resolves chart-token (HTTP 200 OK) prior to dispatching workspace data requests. DevTools network traces confirm 0 premature 401 unauthorized errors across all workspace operations.",
                "screenshot": "screenshots/console_csp_and_401_errors.png",
                "endpoint": "GET /v1/oms/real/pamm/masters",
                "request_payload": {},
                "response_status": 200,
                "response_body": {"success": True},
                "observed_behavior": "Prior to verification on terminal.blacktrader.com, legacy environment logged premature 401. On terminal.blacktrader.com, session token resolves cleanly before data calls; zero 401 errors logged.",
                "expected_behavior": "The PAMM widget lifecycle hook should await parent auth token resolution before dispatching network requests.",
                "root_cause": "Widget componentDidMount fires before JWT session token synchronization is resolved from localStorage/cookie.",
                "reproduction_curl": "curl -X GET 'https://terminal.blacktrader.com/test/v1/oms/real/pamm/masters' -H 'Authorization: Bearer <TOKEN>'"
            },
            {
                "bug_id": "BUG-SEC-003",
                "scenario_id": "BTPAMM-F001",
                "title": "CSP Header 'script-src self' Blocks Cloudflare Analytics Beacon",
                "category": "Security & Network",
                "severity": "P2 (Medium)",
                "bug_type": "CONSOLE",
                "status": "RESOLVED",
                "resolution_notes": "Verified clean on terminal.blacktrader.com deployment. DevTools network traces confirm the Cloudflare analytics beacon (vce70182...) executes and transmits RUM telemetry with HTTP 204 No Content without being blocked by Content Security Policy directives.",
                "screenshot": "screenshots/console_csp_and_401_errors.png",
                "endpoint": "https://static.cloudflareinsights.com/beacon.min.js",
                "request_payload": {},
                "response_status": 204,
                "response_body": "HTTP 204 No Content - RUM telemetry beacon transmitted successfully.",
                "observed_behavior": "On legacy domain, CSP blocked beacon script. On terminal.blacktrader.com, Cloudflare RUM beacon executes cleanly with status 204.",
                "expected_behavior": "Either remove the third-party Cloudflare analytics script from index.html or whitelist static.cloudflareinsights.com in the HTTP CSP response header.",
                "root_cause": "Nginx/Cloudflare proxy injects CSP 'script-src self' while the SPA template still references Cloudflare beacon.",
                "reproduction_curl": "# Inspect DevTools network on https://terminal.blacktrader.com/test/home/dashboard"
            }
        ]
        self.bugs = []  # Reset with clean genuine list
        for b in known:
            self.record_bug(
                bug_id=b["bug_id"],
                scenario_id=b["scenario_id"],
                title=b["title"],
                category=b["category"],
                severity=b["severity"],
                endpoint=b["endpoint"],
                observed_behavior=b["observed_behavior"],
                expected_behavior=b["expected_behavior"],
                root_cause=b["root_cause"],
                request_payload=b["request_payload"],
                response_status=b["response_status"],
                response_body=b["response_body"],
                reproduction_curl=b["reproduction_curl"],
                bug_type=b["bug_type"],
                screenshot=b["screenshot"],
                status=b.get("status", "OPEN"),
                resolution_notes=b.get("resolution_notes")
            )

