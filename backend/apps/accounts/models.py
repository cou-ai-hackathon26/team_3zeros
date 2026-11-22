import uuid
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from apps.common.models import TimeStamped

class UserManager(BaseUserManager):
    def create_user(self, phone=None, email=None, password=None, display_name="", **extra_fields):
        if not phone and not email:
            raise ValueError("Either phone number or email must be provided.")
        if email:
            email = self.normalize_email(email)
        user = self.model(
            phone=phone,
            email=email,
            display_name=display_name,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        return self.create_user(email=email, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStamped):
    """
    Custom user model per MASTERPLAN §4.1 / BACKEND §4.1.
    Primary key is BigAutoField, public_id is UUIDv4.
    """
    LANGUAGE_CHOICES = [
        ("bn", "Bangla"),
        ("en", "English"),
    ]

    phone = models.CharField(max_length=20, unique=True, null=True, blank=True, db_index=True)
    email = models.EmailField(unique=True, null=True, blank=True, db_index=True)
    display_name = models.CharField(max_length=255, blank=True)
    preferred_language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default="bn")
    is_active = models.BooleanField(default=True)
    mfa_enabled = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.display_name or self.phone or self.email or str(self.public_id)


class Membership(TimeStamped):
    """
    Facility membership per MASTERPLAN §4 / BACKEND §4.1.
    Grants role and permission scopes for a specific facility.
    """
    ROLE_CHOICES = [
        ("clinician", "Clinician"),
        ("facility_staff", "Facility Staff"),
        ("facility_admin", "Facility Admin"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    facility = models.ForeignKey(
        "organizations.Facility",
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    permissions = models.JSONField(default=list, blank=True)
    active_from = models.DateTimeField(auto_now_add=True)
    active_to = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "facility", "role")

    def __str__(self):
        return f"Membership({self.user_id}, {self.facility_id}, {self.role})"


class PatientAccount(TimeStamped):
    """
    One-to-one link between authenticated User and identity.Patient.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="patient_account")
    patient = models.OneToOneField(
        "identity.Patient",
        on_delete=models.CASCADE,
        related_name="account",
    )

    def __str__(self):
        return f"PatientAccount(user={self.user_id}, patient={self.patient_id})"


class PlatformAdmin(TimeStamped):
    """
    Platform admin flag model per BACKEND §4.1.
    Grants platform operation rights, NO default access to patient clinical records.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="platform_admin")

    def __str__(self):
        return f"PlatformAdmin({self.user_id})"
