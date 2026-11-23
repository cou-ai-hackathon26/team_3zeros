"""In-app notifications (MASTERPLAN §6.3, §6.4; INV-6: notifications never perform an action).

Texts are fixed here in Bangla and English and chosen by each recipient's language. They carry no clinical
content: only that something needs attention, with the object id for the app to open."""
from typing import Iterable, List, Optional

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Membership
from .models import Notification

User = get_user_model()

MESSAGES = {
    "referral.consent_requested": {"en": ("Your consent is needed", "A doctor is asking your permission to share your record for a referral."),
                                   "bn": ("আপনার সম্মতি প্রয়োজন", "একজন ডাক্তার রেফারেলের জন্য আপনার রেকর্ড শেয়ার করতে আপনার অনুমতি চাইছেন।")},
    "referral.consent_refused": {"en": ("Patient refused consent", "A referral went back to draft because the patient refused consent."),
                                 "bn": ("রোগী সম্মতি দেননি", "রোগী সম্মতি না দেওয়ায় একটি রেফারেল খসড়ায় ফিরে গেছে।")},
    "referral.received": {"en": ("New referral received", "A referral is waiting for you to acknowledge."),
                          "bn": ("নতুন রেফারেল এসেছে", "একটি রেফারেল আপনার গ্রহণের অপেক্ষায় আছে।")},
    "referral.received_emergency": {"en": ("Emergency referral received", "An emergency referral is waiting for you to acknowledge now."),
                                    "bn": ("জরুরী রেফারেল এসেছে", "একটি জরুরী রেফারেল এখনই আপনার গ্রহণের অপেক্ষায় আছে।")},
    "referral.escalated": {"en": ("Emergency referral not acknowledged", "An emergency referral has not been acknowledged in time."),
                           "bn": ("জরুরী রেফারেল গ্রহণ করা হয়নি", "একটি জরুরী রেফারেল সময়মতো গ্রহণ করা হয়নি।")},
    "referral.acknowledged": {"en": ("Referral acknowledged", "The receiving facility acknowledged your referral."),
                              "bn": ("রেফারেল গ্রহণ করা হয়েছে", "গ্রহণকারী প্রতিষ্ঠান আপনার রেফারেল গ্রহণ করেছে।")},
    "referral.declined": {"en": ("Referral declined", "The receiving facility declined your referral."),
                          "bn": ("রেফারেল প্রত্যাখ্যাত", "গ্রহণকারী প্রতিষ্ঠান আপনার রেফারেল প্রত্যাখ্যান করেছে।")},
    "referral.outcome_returned": {"en": ("Referral outcome returned", "The receiving doctor recorded an outcome for your referral."),
                                  "bn": ("রেফারেলের ফলাফল ফিরে এসেছে", "গ্রহণকারী ডাক্তার আপনার রেফারেলের ফলাফল লিখেছেন।")},
    "referral.sync_failed": {"en": ("Referral could not be saved to the health record", "An action did not reach the health record system. Please retry."),
                             "bn": ("রেফারেল স্বাস্থ্য রেকর্ডে সংরক্ষণ করা যায়নি", "একটি কাজ স্বাস্থ্য রেকর্ড ব্যবস্থায় পৌঁছায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।")},
    "referral.reminder": {"en": ("Referral still waiting", "A referral has not been acknowledged yet."),
                          "bn": ("রেফারেল এখনও অপেক্ষায়", "একটি রেফারেল এখনও গ্রহণ করা হয়নি।")},
    "appointment.accepted": {"en": ("Appointment confirmed", "Your appointment request was confirmed."),
                             "bn": ("অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে", "আপনার অ্যাপয়েন্টমেন্ট অনুরোধ নিশ্চিত করা হয়েছে।")},
    "appointment.declined": {"en": ("Appointment declined", "Your appointment request was declined."),
                             "bn": ("অ্যাপয়েন্টমেন্ট প্রত্যাখ্যাত", "আপনার অ্যাপয়েন্টমেন্ট অনুরোধ প্রত্যাখ্যান করা হয়েছে।")},
    "appointment.alternate_proposed": {"en": ("A different time was proposed", "The doctor proposed another time. Please accept or decline it."),
                                       "bn": ("অন্য সময় প্রস্তাব করা হয়েছে", "ডাক্তার অন্য একটি সময় প্রস্তাব করেছেন। অনুগ্রহ করে গ্রহণ বা প্রত্যাখ্যান করুন।")},
    "appointment.cancelled": {"en": ("Appointment cancelled", "Your appointment was cancelled."),
                              "bn": ("অ্যাপয়েন্টমেন্ট বাতিল", "আপনার অ্যাপয়েন্টমেন্ট বাতিল করা হয়েছে।")},
    "appointment.expired": {"en": ("Appointment request expired", "Your appointment request expired without an answer."),
                            "bn": ("অ্যাপয়েন্টমেন্ট অনুরোধের মেয়াদ শেষ", "উত্তর ছাড়াই আপনার অ্যাপয়েন্টমেন্ট অনুরোধের মেয়াদ শেষ হয়েছে।")},
}


def notify(users: Iterable, type: str, object_ref=None) -> List[Notification]:
    """One in-app notification per distinct active user, in that user's language."""
    texts = MESSAGES[type]
    made, seen = [], set()
    for user in users:
        if user is None or user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        lang = "en" if getattr(user, "preferred_language", "bn") == "en" else "bn"
        title, body = texts[lang]
        made.append(Notification.objects.create(recipient=user, type=type, title=title, body=body, object_ref=object_ref, channel="in_app", state="SENT", sent_at=timezone.now()))
    return made


def facility_users(facility, roles: Iterable[str] = ("clinician",), permission: Optional[str] = None) -> List:
    """Active users of a facility in the given roles. `permission` adds facility_staff who hold it (e.g. referral.acknowledge).
    Permissions are checked in Python because JSON `contains` is not available on every database."""
    now = timezone.now()
    live = Q(active_to__isnull=True) | Q(active_to__gt=now)
    users = []
    for m in Membership.objects.filter(live, facility=facility).select_related("user"):
        if m.role in roles or (permission and m.role == "facility_staff" and permission in (m.permissions or [])):
            users.append(m.user)
    return users


def patient_user(patient):
    account = getattr(patient, "account", None)
    return account.user if account else None
