"""
Verify a running deployment through its public gateway, and report what each
check actually proved.

This exists because "the deployment went green" is not evidence that the system
works. A platform reports a container started; it does not tell you that the
gateway can reach the engine, that an unauthenticated caller is refused, that
the formulary arrived, or that the audit chain still verifies. Each check below
is one of those questions, and the script prints the answer it got rather than
a pass/fail badge — a check that "passes" while reporting a degraded engine
would otherwise read as everything being fine.

It changes nothing. Every request is a GET except the sign-in, and the account
it signs in as is the operator's own.

    BNP_EMAIL=… BNP_PASSWORD=… python scripts/verify_deployment.py \
        --base-url https://<gateway-domain>

Exit status is 0 only if every check that must hold, held. Checks that report
*state* rather than correctness — whether the engine is degraded, how many
drugs are approved — are printed but never fail the run: a fresh deployment
with no corpus is expected to be degraded, and pretending otherwise is the
failure mode this whole codebase is written against.
"""
import argparse
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

# ANSI is unhelpful in platform log viewers, which is where this usually runs.
OK = "PASS"
BAD = "FAIL"
INFO = "INFO"


class Checker:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.failures = []

    def call(self, method, path, body=None):
        """Returns (status, parsed-or-raw-body). An HTTP error is a result, not
        an exception: half these checks are asserting a 401."""
        url = f"{self.base}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=60) as res:
                return res.status, self._parse(res.read(), res.headers)
        except urllib.error.HTTPError as e:
            return e.code, self._parse(e.read(), e.headers)

    @staticmethod
    def _parse(raw, headers):
        if "application/json" in (headers.get("Content-Type") or ""):
            try:
                return json.loads(raw or b"null")
            except ValueError:
                pass
        return raw.decode("utf-8", "replace")

    def check(self, name, condition, detail):
        mark = OK if condition else BAD
        print(f"[{mark}] {name} — {detail}")
        if not condition:
            self.failures.append(name)

    @staticmethod
    def note(name, detail):
        print(f"[{INFO}] {name} — {detail}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Public gateway origin")
    args = parser.parse_args()

    email = os.environ.get("BNP_EMAIL", "")
    password = os.environ.get("BNP_PASSWORD", "")

    c = Checker(args.base_url)
    print(f"Verifying {c.base}\n")

    status, body = c.call("GET", "/api/healthz")
    c.check("gateway healthz", status == 200, f"HTTP {status}")

    status, body = c.call("GET", "/")
    served_spa = status == 200 and isinstance(body, str) and "<div id=\"root\"" in body
    c.check("web app served", served_spa, f"HTTP {status}, {len(body) if isinstance(body, str) else 0} bytes")

    status, body = c.call("GET", "/api/auth/methods")
    c.check(
        "sign-in methods advertised",
        status == 200 and isinstance(body, dict) and "oidc" in body,
        f"HTTP {status}: {body}",
    )

    # The engine must never be reachable without a session. This is the check
    # that would catch the gateway being accidentally bypassed.
    status, body = c.call("GET", "/bnp-api/health")
    c.check(
        "engine refuses an unauthenticated caller",
        status == 401,
        f"HTTP {status} (expected 401)",
    )

    status, body = c.call("GET", "/api/auth/user")
    c.check(
        "no session before sign-in",
        status == 200 and isinstance(body, dict) and body.get("user") is None,
        f"HTTP {status}",
    )

    if not (email and password):
        c.note("sign-in", "skipped — set BNP_EMAIL and BNP_PASSWORD to exercise it")
        return 1 if c.failures else 0

    status, body = c.call("POST", "/api/auth/login", {"email": email, "password": password})
    signed_in = status == 200 and isinstance(body, dict) and body.get("user")
    c.check("sign-in with a password", bool(signed_in), f"HTTP {status}")
    if not signed_in:
        return 1

    roles = (body.get("user") or {}).get("roles") or []
    c.check("roles come from ADMIN_EMAILS", "admin" in roles, f"roles={roles}")

    status, body = c.call("GET", "/api/auth/user")
    c.check(
        "session survives the response",
        status == 200 and isinstance(body, dict) and body.get("user"),
        f"HTTP {status}",
    )

    # Now the same engine route that refused above.
    status, body = c.call("GET", "/bnp-api/health")
    reached = status in (200, 503) and isinstance(body, dict) and "indexed_chunks" in body
    c.check("gateway reaches the engine", reached, f"HTTP {status}")
    if reached:
        # Deliberately not a failure. A deployment with no corpus and no API key
        # is *supposed* to report degraded; calling that a pass or a fail would
        # both be lies.
        c.note("engine readiness", f"{body.get('status')}: {body.get('problems') or 'no problems'}")
        c.note("formulary", json.dumps(body.get("formulary")))

    status, body = c.call("GET", "/bnp-api/auth/audit-log/verify")
    c.check(
        "audit chain verifies",
        status == 200 and isinstance(body, dict) and body.get("valid") is True,
        f"HTTP {status}: {body if status != 200 else body.get('valid')}",
    )

    status, body = c.call("GET", "/bnp-api/formulary?status=approved&limit=1")
    if status == 200 and isinstance(body, dict):
        c.note("approved drugs", str(body.get("total", body.get("count", "?"))))
    else:
        c.check("formulary listing", False, f"HTTP {status}")

    print()
    if c.failures:
        print(f"{len(c.failures)} check(s) failed: {', '.join(c.failures)}")
        return 1
    print("All checks that must hold, held.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
