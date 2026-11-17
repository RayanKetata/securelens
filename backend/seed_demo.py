"""Fill an empty SecureLens instance with fictional demo data, through the API.

Creates the first admin account (or signs in with it), plus an analyst
and a viewer, three systems with controls, saved assessments, findings,
and text evidence. Nothing here is real: every company, person, and
document is made up.

    python seed_demo.py --api http://127.0.0.1:8000 --password "<admin password>"

The analyst and viewer get the same password, so a reviewer can sign
in as each role. Use only on a demo instance.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid

CONTROLS = {
    "AC-2": ("Account Management", "Access Control",
             "Focuses on creating, enabling, modifying, reviewing, disabling, and removing system accounts."),
    "AC-3": ("Access Enforcement", "Access Control",
             "Ensures that approved authorization rules are enforced when users access systems and information."),
    "AC-6": ("Least Privilege", "Access Control",
             "Ensures users and processes receive only the minimum privileges required to perform their duties."),
    "AU-2": ("Event Logging", "Audit and Accountability",
             "Defines the types of system events that should be logged for security monitoring and investigation."),
    "IA-2": ("Identification and Authentication", "Identification and Authentication",
             "Requires users to be uniquely identified and authenticated, including multi-factor authentication."),
    "CP-9": ("System Backup", "Contingency Planning",
             "Requires backups of user and system data, protection of backup copies, and restore testing."),
    "IR-4": ("Incident Handling", "Incident Response",
             "Establishes the capability to prepare for, detect, analyze, contain, and recover from incidents."),
    "RA-5": ("Vulnerability Monitoring and Scanning", "Risk Assessment",
             "Requires regular scanning for vulnerabilities and timely remediation of findings."),
    "SC-7": ("Boundary Protection", "System and Communications Protection",
             "Monitors and controls communications at external and key internal system boundaries."),
    "SI-2": ("Flaw Remediation", "System and Information Integrity",
             "Requires identifying, reporting, and correcting system flaws, including timely patching."),
}

# (status, analyst notes, findings, evidence filename, evidence text)
SYSTEMS = [
    {
        "name": "Northwind Customer Portal",
        "owner": "Digital Services",
        "environment": "Production",
        "description": "Public web portal where customers manage orders and invoices.",
        "controls": {
            "AC-2": ("Met", "Quarterly access reviews are documented and signed off.", "",
                     "access-review-q3.txt",
                     "Northwind Access Review Q3. All 142 portal admin accounts were reviewed by the "
                     "application owner on 2026-09-30. 6 inactive accounts were disabled within 2 days. "
                     "New accounts require a ticket approved by the user's manager."),
            "IA-2": ("Partially Met", "MFA is enforced for staff but optional for customer accounts.",
                     "Customer accounts can sign in with a password only.",
                     "identity-standard.txt",
                     "Identity Standard v2. Staff sign in through single sign-on with multi-factor "
                     "authentication enforced. Customer accounts may enable MFA; it is not required."),
            "AU-2": ("Met", "Security events are forwarded to the central log platform.", "",
                     "logging-config.txt",
                     "Logging configuration. Sign-in success and failure, privilege changes, and admin "
                     "actions are sent to the central log platform and kept for 365 days."),
            "RA-5": ("Not Met", "No authenticated scans in the last two quarters.",
                     "Weekly scans run unauthenticated only; 3 high findings open for over 60 days.",
                     "scan-summary.txt",
                     "Vulnerability scan summary, October 2026. Unauthenticated external scan. "
                     "3 high and 11 medium findings. Oldest high finding first seen 2026-07-12."),
            "SC-7": ("Met", "WAF and network segmentation verified.", "", None, None),
            "SI-2": ("Partially Met", "Patching is on time for servers but not for container images.",
                     "Base images rebuilt monthly instead of within the 14-day policy window.", None, None),
        },
    },
    {
        "name": "Payroll Processing Service",
        "owner": "Finance IT",
        "environment": "Production",
        "description": "Internal service that calculates and submits payroll every two weeks.",
        "controls": {
            "AC-6": ("Partially Met", "Two service accounts have broader rights than needed.",
                     "svc-payroll-batch has database owner rights; it needs read and write only.",
                     "privilege-audit.txt",
                     "Privilege audit. svc-payroll-batch is a member of db_owner. svc-payroll-report "
                     "has read-only access as intended. Human admins: 3, all approved."),
            "CP-9": ("Met", "Nightly encrypted backups with a successful restore test in August.", "",
                     "backup-report.txt",
                     "Backup report. Nightly encrypted backups to a separate region. Restore test on "
                     "2026-08-14 recovered the full database in 47 minutes."),
            "IR-4": ("Not Assessed", "", "", None, None),
            "AC-2": ("Met", "Joiner and leaver process linked to HR system.", "", None, None),
        },
    },
    {
        "name": "Field Inspection Mobile App",
        "owner": "Operations",
        "environment": "Staging",
        "description": "Mobile app that inspectors use to record site visits and photos.",
        "controls": {
            "IA-2": ("Not Assessed", "", "", None, None),
            "AU-2": ("Not Assessed", "", "", None, None),
            "SI-2": ("Not Assessed", "", "", None, None),
        },
    },
]


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def call(self, method, path, body=None, raw=None, content_type="application/json"):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", content_type)
        if self.token:
            request.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                text = response.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            raise SystemExit(f"{method} {path} failed ({error.code}): {error.read().decode()[:300]}")

    def upload(self, path, filename, text):
        boundary = uuid.uuid4().hex
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: text/plain\r\n\r\n{text}\r\n--{boundary}--\r\n"
        ).encode()
        return self.call("POST", path, raw=body, content_type=f"multipart/form-data; boundary={boundary}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="API base URL")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", required=True, help="at least 12 characters")
    args = parser.parse_args()

    api = Api(args.api)
    if api.call("GET", "/auth/status")["setupRequired"]:
        api.token = api.call("POST", "/auth/setup", {"username": args.username, "password": args.password})["token"]
        print(f"Created admin account {args.username}")
    else:
        api.token = api.call("POST", "/auth/login", {"username": args.username, "password": args.password})["token"]

    if api.call("GET", "/systems"):
        sys.exit("This instance already has systems; the demo data is meant for an empty one.")

    existing = {user["username"] for user in api.call("GET", "/users")}
    for username, role in (("analyst", "analyst"), ("viewer", "viewer")):
        if username not in existing:
            api.call("POST", "/users", {"username": username, "password": args.password, "role": role})
            print(f"Created {role} account {username}")

    for system in SYSTEMS:
        created = api.call("POST", "/systems", {key: system[key] for key in ("name", "owner", "environment", "description")})
        url = f"/systems/{created['id']}"
        api.call("POST", url + "/controls", [
            {"code": code, "name": CONTROLS[code][0], "family": CONTROLS[code][1], "description": CONTROLS[code][2]}
            for code in system["controls"]
        ])
        for code, (status, notes, findings, filename, text) in system["controls"].items():
            if filename:
                api.upload(f"{url}/controls/{code}/evidence", filename, text)
            if status != "Not Assessed":
                api.call("PUT", f"{url}/controls/{code}", {"status": status, "analystNotes": notes, "findings": findings})
        print(f"Added {system['name']} with {len(system['controls'])} controls")

    print("Done.")


if __name__ == "__main__":
    main()
