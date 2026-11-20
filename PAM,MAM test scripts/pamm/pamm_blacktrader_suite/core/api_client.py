"""
Unified Platform API Client for BlackTrader / BlackFX
Connects to Admin Backoffice & Client OMS with deep error reporting.
"""

import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple
from core.config import Config

class APIResponse:
    def __init__(self, status_code: int, data: Any, error: Optional[str] = None, headers: Optional[Dict] = None):
        self.status_code = status_code
        self.data = data
        self.error = error
        self.headers = headers or {}
        self.is_success = 200 <= status_code < 300

    def get(self, key: str, default=None):
        if isinstance(self.data, dict):
            return self.data.get(key, default)
        return default

class PlatformAPIClient:
    def __init__(self, base_url: str = Config.BASE_URL, admin_url: Optional[str] = None, admin_email: Optional[str] = None, admin_password: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.admin_url = (admin_url or getattr(Config, "ADMIN_BASE_URL", self.base_url)).rstrip("/")
        self.admin_email = admin_email or Config.BLACKADMIN_EMAIL
        self.admin_password = admin_password or Config.BLACKADMIN_PASSWORD
        self.user_agent = Config.USER_AGENT
        self._admin_token = None
        self._client_tokens: Dict[str, str] = {}

    def _request(
        self,
        endpoint: str,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        token: Optional[str] = None,
        cookie: Optional[str] = None,
        timeout: int = 15,
    ) -> APIResponse:
        is_admin_ep = (
            endpoint.startswith("/admin")
            or endpoint.startswith("/api/members")
            or endpoint.startswith("/api/settings")
            or endpoint == "/api/login"
        )
        base = self.admin_url if is_admin_ep else self.base_url
        url = f"{base}{endpoint}"
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if cookie:
            headers["Cookie"] = cookie

        encoded_data = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            encoded_data = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content = resp.read().decode("utf-8")
                parsed = json.loads(content) if content else {}
                set_cookie = resp.headers.get("Set-Cookie")
                if set_cookie and isinstance(parsed, dict):
                    parsed["_cookie"] = set_cookie.split(";")[0]
                return APIResponse(resp.status, parsed, headers=dict(resp.headers))
        except urllib.error.HTTPError as e:
            err_content = e.read().decode("utf-8") if e.fp else ""
            try:
                parsed_err = json.loads(err_content) if err_content else {}
            except Exception:
                parsed_err = {"raw": err_content}
            return APIResponse(e.code, parsed_err, error=str(e), headers=dict(e.headers))
        except Exception as e:
            return APIResponse(0, {}, error=str(e))

    # --------------------------------------------------------------------------
    # Admin Backoffice Interactions
    # --------------------------------------------------------------------------
    def get_admin_token(self) -> str:
        if self._admin_token:
            return self._admin_token
        login_ep = "/api/login" if "terminal.blacktrader.com" in self.admin_url else "/admin/api/login"
        res = self._request(
            login_ep,
            method="POST",
            data={
                "email": self.admin_email,
                "password": self.admin_password,
                "remember": True,
            },
        )
        self._admin_token = res.get("token")
        return self._admin_token or ""

    def create_member(self, email: str, password: str, name: str = "PAMM Investor") -> APIResponse:
        token = self.get_admin_token()
        members_ep = "/api/members" if "terminal.blacktrader.com" in getattr(Config, "ADMIN_BASE_URL", "") else "/admin/api/members"
        return self._request(
            members_ep,
            method="POST",
            data={"email": email, "password": password, "name": name},
            token=token,
        )

    def set_member_balance(self, member_id: str, balance: float, instance: str = "real", remark: str = "Seed") -> APIResponse:
        token = self.get_admin_token()
        prefix = "/api/members" if "terminal.blacktrader.com" in getattr(Config, "ADMIN_BASE_URL", "") else "/admin/api/members"
        return self._request(
            f"{prefix}/{member_id}/balance",
            method="POST",
            data={"instance": instance, "balance": balance, "remark": remark},
            token=token,
        )

    # --------------------------------------------------------------------------
    # Client Portal & Auth
    # --------------------------------------------------------------------------
    def login_client(self, email: str, password: str) -> Optional[str]:
        if email in self._client_tokens:
            return self._client_tokens[email]
        login_ep = "/home/api/auth/login" if "terminal.blacktrader.com" in self.base_url else "/api/auth/login"
        token_ep = "/home/api/auth/chart-token" if "terminal.blacktrader.com" in self.base_url else "/api/auth/chart-token"
        login_res = self._request(
            login_ep,
            method="POST",
            data={"email": email, "password": password, "remember": True},
        )
        if not login_res.is_success:
            return None
        cookie = login_res.get("_cookie")
        token_res = self._request(token_ep, method="POST", cookie=cookie)
        token = token_res.get("token")
        if token:
            self._client_tokens[email] = token
        return token

    # --------------------------------------------------------------------------
    # PAMM Management & Subscriptions
    # --------------------------------------------------------------------------
    def get_pamm_masters(self, token: str, instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/pamm/masters", token=token)

    def register_pamm_master(self, token: str, display_name: str, share_percent: float = 20.0, instance: str = "real") -> APIResponse:
        return self._request(
            f"/v1/oms/{instance}/pamm/master",
            method="POST",
            data={"display_name": display_name, "share_percent": share_percent},
            token=token,
        )

    def get_pamm_follows(self, token: str, instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/pamm/follows", token=token)

    def join_pamm_pool(self, token: str, master_client_id: str, deposit: float, op_key: str, instance: str = "real") -> APIResponse:
        return self._request(
            f"/v1/oms/{instance}/pamm/join",
            method="POST",
            data={"master_client_id": master_client_id, "deposit": deposit, "operation_key": op_key},
            token=token,
        )

    def unfollow_pamm_pool(self, token: str, instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/pamm/unfollow", method="POST", token=token)

    def get_pamm_allocations(self, token: str, role: Optional[str] = None, limit: int = 500, instance: str = "real") -> APIResponse:
        q = f"?limit={limit}"
        if role:
            q += f"&role={role}"
        return self._request(f"/v1/oms/{instance}/pamm/allocations{q}", token=token)

    def get_pamm_shares(self, token: str, role: str = "master", instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/pamm/shares?role={role}", token=token)

    # --------------------------------------------------------------------------
    # Trading & Orders
    # --------------------------------------------------------------------------
    def place_order(
        self,
        token: str,
        symbol: str = "EURUSD",
        side: str = "BUY",
        qty: float = 1.0,
        order_type: str = "MARKET",
        price: Optional[float] = None,
        sl: Optional[float] = None,
        tp: Optional[float] = None,
        instance: str = "real"
    ) -> APIResponse:
        payload = {"symbol": symbol, "side": side, "qty": qty, "type": order_type}
        if price is not None:
            payload["price"] = price
        if sl is not None:
            payload["sl"] = sl
        if tp is not None:
            payload["tp"] = tp
        return self._request(f"/v1/oms/{instance}/orders", method="POST", data=payload, token=token)

    def get_positions(self, token: str, instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/positions", token=token)

    def squareoff_position(self, token: str, market_order_id: str, instance: str = "real") -> APIResponse:
        return self._request(
            f"/v1/oms/{instance}/positions/{market_order_id}/squareoff",
            method="POST",
            data={},
            token=token,
        )

    def get_trade_history(self, token: str, limit: int = 100, instance: str = "real") -> APIResponse:
        return self._request(f"/v1/oms/{instance}/history?limit={limit}", token=token)

