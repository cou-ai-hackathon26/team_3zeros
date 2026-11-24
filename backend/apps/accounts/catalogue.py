"""The permission catalogue (MASTERPLAN D-16). The only place permission strings are defined."""

PERMISSIONS = [
    {"code": "schedule.manage", "description": "Decide appointment requests and manage the facility's schedule"},
    {"code": "referral.acknowledge", "description": "Acknowledge or decline incoming referrals"},
    {"code": "referral.create", "description": "Create outgoing referrals"},
    {"code": "emergency.create", "description": "Create emergency referrals"},
    {"code": "ed.manage", "description": "Intake, triage, and manage emergency department visits"},
    {"code": "consent.record_assisted", "description": "Record witnessed in-person consent for patients without accounts"},
]
PERMISSION_CODES = [p["code"] for p in PERMISSIONS]

# Roles that can be given through the admin API. `platform_admin` is created only by a management command.
STAFF_ROLES = ["clinician", "facility_staff", "facility_admin"]
