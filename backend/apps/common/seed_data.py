"""Static tables for the `seed_bangladesh` command: administrative areas, names, specialties and facility sections.

Everything here is synthetic demo data. Area codes are internal (`BD-<slug>`), not BBS codes."""

DIVISIONS = {
    "Barishal": ("বরিশাল", [("Barguna", "বরগুনা"), ("Barishal", "বরিশাল"), ("Bhola", "ভোলা"), ("Jhalokati", "ঝালকাঠি"), ("Patuakhali", "পটুয়াখালী"), ("Pirojpur", "পিরোজপুর")]),
    "Chattogram": ("চট্টগ্রাম", [("Bandarban", "বান্দরবান"), ("Brahmanbaria", "ব্রাহ্মণবাড়িয়া"), ("Chandpur", "চাঁদপুর"), ("Chattogram", "চট্টগ্রাম"), ("Cumilla", "কুমিল্লা"), ("Cox's Bazar", "কক্সবাজার"), ("Feni", "ফেনী"), ("Khagrachhari", "খাগড়াছড়ি"), ("Lakshmipur", "লক্ষ্মীপুর"), ("Noakhali", "নোয়াখালী"), ("Rangamati", "রাঙামাটি")]),
    "Dhaka": ("ঢাকা", [("Dhaka", "ঢাকা"), ("Faridpur", "ফরিদপুর"), ("Gazipur", "গাজীপুর"), ("Gopalganj", "গোপালগঞ্জ"), ("Kishoreganj", "কিশোরগঞ্জ"), ("Madaripur", "মাদারীপুর"), ("Manikganj", "মানিকগঞ্জ"), ("Munshiganj", "মুন্সিগঞ্জ"), ("Narayanganj", "নারায়ণগঞ্জ"), ("Narsingdi", "নরসিংদী"), ("Rajbari", "রাজবাড়ী"), ("Shariatpur", "শরীয়তপুর"), ("Tangail", "টাঙ্গাইল")]),
    "Khulna": ("খুলনা", [("Bagerhat", "বাগেরহাট"), ("Chuadanga", "চুয়াডাঙ্গা"), ("Jashore", "যশোর"), ("Jhenaidah", "ঝিনাইদহ"), ("Khulna", "খুলনা"), ("Kushtia", "কুষ্টিয়া"), ("Magura", "মাগুরা"), ("Meherpur", "মেহেরপুর"), ("Narail", "নড়াইল"), ("Satkhira", "সাতক্ষীরা")]),
    "Mymensingh": ("ময়মনসিংহ", [("Jamalpur", "জামালপুর"), ("Mymensingh", "ময়মনসিংহ"), ("Netrokona", "নেত্রকোনা"), ("Sherpur", "শেরপুর")]),
    "Rajshahi": ("রাজশাহী", [("Bogura", "বগুড়া"), ("Joypurhat", "জয়পুরহাট"), ("Naogaon", "নওগাঁ"), ("Natore", "নাটোর"), ("Chapainawabganj", "চাঁপাইনবাবগঞ্জ"), ("Pabna", "পাবনা"), ("Rajshahi", "রাজশাহী"), ("Sirajganj", "সিরাজগঞ্জ")]),
    "Rangpur": ("রংপুর", [("Dinajpur", "দিনাজপুর"), ("Gaibandha", "গাইবান্ধা"), ("Kurigram", "কুড়িগ্রাম"), ("Lalmonirhat", "লালমনিরহাট"), ("Nilphamari", "নীলফামারী"), ("Panchagarh", "পঞ্চগড়"), ("Rangpur", "রংপুর"), ("Thakurgaon", "ঠাকুরগাঁও")]),
    "Sylhet": ("সিলেট", [("Habiganj", "হবিগঞ্জ"), ("Moulvibazar", "মৌলভীবাজার"), ("Sunamganj", "সুনামগঞ্জ"), ("Sylhet", "সিলেট")]),
}

# Divisional medical college hospitals: (division, district, English name, Bangla name)
MEDICAL_COLLEGES = [
    ("Barishal", "Barishal", "Sher-e-Bangla Medical College Hospital", "শের-ই-বাংলা মেডিকেল কলেজ হাসপাতাল"),
    ("Chattogram", "Chattogram", "Chattogram Medical College Hospital", "চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল"),
    ("Dhaka", "Dhaka", "Dhaka Medical College Hospital", "ঢাকা মেডিকেল কলেজ হাসপাতাল"),
    ("Khulna", "Khulna", "Khulna Medical College Hospital", "খুলনা মেডিকেল কলেজ হাসপাতাল"),
    ("Mymensingh", "Mymensingh", "Mymensingh Medical College Hospital", "ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল"),
    ("Rajshahi", "Rajshahi", "Rajshahi Medical College Hospital", "রাজশাহী মেডিকেল কলেজ হাসপাতাল"),
    ("Rangpur", "Rangpur", "Rangpur Medical College Hospital", "রংপুর মেডিকেল কলেজ হাসপাতাল"),
    ("Sylhet", "Sylhet", "Sylhet MAG Osmani Medical College Hospital", "সিলেট এম.এ.জি. ওসমানী মেডিকেল কলেজ হাসপাতাল"),
]

# (code, English, Bangla, weight among the doctors who are not emergency physicians)
SPECIALTIES = [
    ("general_medicine", "General Medicine", "সাধারণ মেডিসিন", 22),
    ("pediatrics", "Pediatrics", "শিশুরোগ", 10),
    ("gynecology", "Gynecology & Obstetrics", "স্ত্রীরোগ ও প্রসূতিবিদ্যা", 10),
    ("cardiology", "Cardiology", "হৃদরোগ", 6),
    ("orthopedics", "Orthopedics", "অর্থোপেডিকস", 6),
    ("dermatology", "Dermatology", "চর্মরোগ", 5),
    ("surgery", "General Surgery", "সাধারণ সার্জারি", 8),
    ("ent", "ENT (Ear, Nose & Throat)", "নাক-কান-গলা", 4),
    ("ophthalmology", "Ophthalmology", "চক্ষুরোগ", 4),
    ("neurology", "Neurology", "স্নায়ুরোগ", 3),
    ("psychiatry", "Psychiatry", "মানসিক রোগ", 3),
    ("urology", "Urology", "মূত্ররোগ", 2),
    ("gastroenterology", "Gastroenterology", "পরিপাকতন্ত্রের রোগ", 3),
    ("pulmonology", "Pulmonology", "বক্ষব্যাধি", 3),
    ("endocrinology", "Endocrinology & Diabetes", "হরমোন ও ডায়াবেটিস", 3),
    ("nephrology", "Nephrology", "কিডনি রোগ", 2),
    ("oncology", "Oncology", "ক্যান্সার রোগ", 1),
    ("dentistry", "Dentistry", "দন্তরোগ", 3),
    ("anesthesiology", "Anesthesiology", "অ্যানেস্থেসিওলজি", 2),
    ("radiology", "Radiology", "রেডিওলজি", 2),
]
EMERGENCY_SPECIALTY = ("emergency_medicine", "Emergency Medicine", "জরুরি চিকিৎসা")

MALE_NAMES = [("Abdul", "আবদুল"), ("Abu", "আবু"), ("Aminul", "আমিনুল"), ("Anisur", "আনিসুর"), ("Arif", "আরিফ"), ("Asif", "আসিফ"), ("Atiqur", "আতিকুর"), ("Babul", "বাবুল"), ("Delwar", "দেলোয়ার"), ("Enamul", "এনামুল"), ("Faruk", "ফারুক"), ("Habibur", "হাবিবুর"), ("Harun", "হারুন"), ("Imran", "ইমরান"), ("Jahid", "জাহিদ"), ("Kamal", "কামাল"), ("Karim", "করিম"), ("Mahbub", "মাহবুব"), ("Mahmudul", "মাহমুদুল"), ("Mizanur", "মিজানুর"), ("Mostafa", "মোস্তফা"), ("Nasir", "নাসির"), ("Nazrul", "নজরুল"), ("Rafiq", "রফিক"), ("Rakib", "রাকিব"), ("Rashed", "রাশেদ"), ("Rezaul", "রেজাউল"), ("Sabbir", "সাব্বির"), ("Shahidul", "শহিদুল"), ("Shamim", "শামীম"), ("Sohel", "সোহেল"), ("Tanvir", "তানভীর"), ("Tariq", "তারেক"), ("Touhid", "তৌহিদ"), ("Yusuf", "ইউসুফ"), ("Zahirul", "জহিরুল"), ("Zakir", "জাকির"), ("Rubel", "রুবেল"), ("Masud", "মাসুদ"), ("Shafiqul", "শফিকুল")]
FEMALE_NAMES = [("Afroza", "আফরোজা"), ("Ayesha", "আয়েশা"), ("Farzana", "ফারজানা"), ("Fatema", "ফাতেমা"), ("Halima", "হালিমা"), ("Jahanara", "জাহানারা"), ("Jesmin", "জেসমিন"), ("Kamrun", "কামরুন"), ("Khadija", "খাদিজা"), ("Laila", "লায়লা"), ("Lipi", "লিপি"), ("Mahmuda", "মাহমুদা"), ("Maksuda", "মাকসুদা"), ("Marium", "মারিয়াম"), ("Rina", "রিনা"), ("Nasrin", "নাসরিন"), ("Nazma", "নাজমা"), ("Nilufar", "নীলুফার"), ("Parveen", "পারভীন"), ("Rahima", "রহিমা"), ("Rokeya", "রোকেয়া"), ("Rubina", "রুবিনা"), ("Sabina", "সাবিনা"), ("Salma", "সালমা"), ("Shahana", "শাহানা"), ("Shirin", "শিরিন"), ("Sultana", "সুলতানা"), ("Taslima", "তাসলিমা"), ("Tahmina", "তাহমিনা"), ("Tania", "তানিয়া"), ("Umme", "উম্মে"), ("Yasmin", "ইয়াসমিন"), ("Zakia", "জাকিয়া"), ("Shapla", "শাপলা"), ("Moushumi", "মৌসুমী"), ("Popy", "পপি"), ("Rehana", "রেহানা"), ("Sharmin", "শারমিন"), ("Monira", "মনিরা"), ("Shamima", "শামীমা")]
FAMILY_NAMES = [("Ahmed", "আহমেদ"), ("Akter", "আক্তার"), ("Alam", "আলম"), ("Ali", "আলী"), ("Begum", "বেগম"), ("Biswas", "বিশ্বাস"), ("Bhuiyan", "ভূঁইয়া"), ("Chowdhury", "চৌধুরী"), ("Das", "দাস"), ("Dey", "দে"), ("Hasan", "হাসান"), ("Hossain", "হোসেন"), ("Howlader", "হাওলাদার"), ("Islam", "ইসলাম"), ("Karim", "করিম"), ("Khan", "খান"), ("Khatun", "খাতুন"), ("Majumder", "মজুমদার"), ("Mia", "মিয়া"), ("Mollah", "মোল্লা"), ("Mondal", "মণ্ডল"), ("Nath", "নাথ"), ("Paul", "পাল"), ("Rahman", "রহমান"), ("Roy", "রায়"), ("Sarker", "সরকার"), ("Sheikh", "শেখ"), ("Siddique", "সিদ্দিকী"), ("Sikder", "শিকদার"), ("Talukder", "তালুকদার"), ("Uddin", "উদ্দিন"), ("Zaman", "জামান")]

ENCOUNTER_REASONS = ["Fever for three days", "Cough and cold", "Headache", "Abdominal pain", "Back pain", "Skin rash", "Joint pain", "Routine check-up", "High blood pressure follow-up", "Diabetes follow-up", "Loose motion", "Pregnancy check-up", "Child vaccination visit", "Ear pain", "Eye irritation"]
ED_COMPLAINTS = ["Road traffic injury", "Chest pain", "Difficulty breathing", "High fever with convulsion", "Severe abdominal pain", "Fall with limb injury", "Burn injury", "Snake bite", "Labour pains", "Vomiting and dehydration", "Head injury", "Poisoning", "Sudden weakness on one side"]

# Hospital sections: (name, name_bn)
DEPARTMENTS = [("Emergency Department", "জরুরি বিভাগ"), ("Outpatient Department", "বহির্বিভাগ"), ("Inpatient Ward", "অন্তর্বিভাগ"), ("Intensive Care Unit", "নিবিড় পরিচর্যা কেন্দ্র"), ("Radiology & Imaging", "রেডিওলজি ও ইমেজিং"), ("Pathology Laboratory", "প্যাথলজি ল্যাবরেটরি")]
# Services: (code, name, name_bn, only at medical colleges)
SERVICES = [("emergency", "24/7 Emergency Care", "২৪ ঘণ্টা জরুরি সেবা", False), ("outpatient", "Outpatient Clinic", "বহির্বিভাগ", False), ("inpatient", "Inpatient Care", "অন্তর্বিভাগ", False), ("icu", "Intensive Care Unit", "আইসিইউ", False), ("ambulance", "Ambulance Service", "অ্যাম্বুলেন্স সেবা", False), ("radiology", "Radiology & Imaging", "রেডিওলজি ও ইমেজিং", False), ("laboratory", "Pathology Laboratory", "প্যাথলজি ল্যাবরেটরি", False), ("trauma", "Trauma & Burn Care", "ট্রমা ও বার্ন সেবা", True), ("blood_bank", "Blood Bank", "ব্লাড ব্যাংক", True)]

STAFF_KINDS = [
    ("emergency_desk", ["emergency.create", "ed.manage", "referral.acknowledge"]),
    ("scheduler", ["schedule.manage"]),
    ("coordinator", ["referral.acknowledge", "referral.create"]),
    ("registrar", ["consent.record_assisted"]),
]
