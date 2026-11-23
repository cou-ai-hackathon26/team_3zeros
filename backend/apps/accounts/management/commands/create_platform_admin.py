import secrets

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts import security
from apps.accounts.models import PlatformAdmin, User


class Command(BaseCommand):
    help = "Create a platform admin (the only way to make one, MASTERPLAN D-16). Prints the temporary password and TOTP setup URI once."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--username", default=None)

    @transaction.atomic
    def handle(self, *args, **opts):
        email = opts["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f"A user with email {email} already exists.")
        temp = secrets.token_urlsafe(12)
        user = User.objects.create_user(email=email, username=opts["username"], password=temp, display_name=opts["name"], mfa_enabled=True)
        user.mfa_secret = security.new_totp_secret()
        user.save(update_fields=["mfa_secret"])
        PlatformAdmin.objects.create(user=user)
        self.stdout.write(f"Platform admin created: {email}")
        self.stdout.write(f"Temporary password: {temp}")
        self.stdout.write(f"TOTP setup URI: {security.totp_uri(user.mfa_secret, email)}")
        self.stdout.write("These are shown once. Sign in at the admin URL and change nothing else until MFA works.")
