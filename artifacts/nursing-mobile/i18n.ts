/**
 * Mobile localisation.
 *
 * The app previously had no i18n at all: every string was hardcoded Arabic,
 * including the dose-block refusal ("جرعة غير آمنة — تم الإيقاف"). A nurse who
 * does not read Arabic could not read a safety warning, which is not an
 * acceptable failure mode for a clinical tool.
 *
 * Arabic remains the default, matching the deployment. RTL is applied to match.
 */
import { I18nManager } from "react-native";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  // Navigation and shell
  appTitle: "Nursing AI",
  home: "Home",
  back: "Back",
  cancel: "Cancel",
  admin: "Admin",
  adminPanel: "Admin panel",
  signOut: "Sign out",
  loading: "Loading…",

  // Home
  homeSubtitle: "Choose a category for answers grounded in approved sources",
  catPharmacy: "Pharmaceutical standards",
  catPolicies: "Nursing policies",
  catQuality: "Quality and CBAHI",
  drugCalculator: "Drug dose calculator",
  drugCalculatorSubtitle: "Weight-based dosing with safety checks",

  // Auth
  signInRequired: "Sign-in required",
  signInBody:
    "You must sign in with your own account. Every clinical consultation is recorded against your username in the audit log.",
  signIn: "Sign in",
  signingIn: "Signing in…",
  signInNotConfigured:
    "Authentication is not configured in this build. Contact your system administrator.",
  signInCancelled: "Sign-in was cancelled.",
  signInFailed: "Could not exchange the sign-in code with the server.",
  signInNoToken: "The server did not issue a session token.",
  signInUnreachable: "Could not reach the authentication server.",

  // Admin
  accessDenied: "Access denied",
  adminWebBlocked:
    "The admin panel is not available in a browser. Use the mobile app with biometric verification.",
  adminNoBiometrics:
    "Accessing the admin panel requires a fingerprint or face enrolled on this device.",
  adminAuthFailed: "Could not verify your identity. Try again.",
  adminVerifying: "Verifying your identity…",
  adminBiometricPrompt: "Verify your identity to access the admin panel",
  indexedDocumentsReadOnly: "Documents indexed in the clinical engine (read-only)",
  noIndexedDocuments: "No indexed documents",
  documentsLoadFailed: "Could not load documents, or none are indexed",
  useWebToManage: "To add or remove a document, use the web app.",
  segments: "segments",

  // Chat
  askQuestion: "Type your question here…",
  listening: "🎤 Listening…",
  stopRecording: "Stop recording",
  speakQuestion: "Speak your question",
  clearChat: "Clear conversation",
  clearChatConfirm: "Clear this conversation?",
  clear: "Clear",
  engineUnreachable: "Could not reach the clinical engine.",
  sessionExpired: "Your session has expired. Please sign in again.",
  suggestionsTitle: "Try asking",

  // Clinical result sections
  calculatorTitle: "Drug dose calculator",
  quickSelect: "Quick select a drug",
  drugName: "Drug name",
  drugNamePlaceholder: "e.g. Paracetamol",
  patientWeight: "Patient weight (kg) — optional",
  weightPlaceholder: "e.g. 70",
  calculate: "Calculate dose",
  querying: "Querying the clinical engine…",
  results: "Results",
  enterDrugName: "Please enter a drug name",
  unexpectedError: "An unexpected error occurred. Please try again.",

  doseBlocked: "❌ UNSAFE DOSE — BLOCKED",
  doseBlockedDefault:
    "The calculated dose exceeds the maximum. Contact the physician immediately.",
  safetyAlertActive: "Safety alert active — review the alerts below",
  calculatedDose: "Calculated dose",
  indication: "Clinical indication",
  clinicalAnswer: "Clinical answer",
  safetyAlerts: "Safety alerts",
  contraindications: "Contraindications",
  nursingNotes: "Nursing notes",
  source: "Source",
  confidenceHigh: "High confidence",
  confidenceMedium: "Medium confidence",
  confidenceLow: "Low confidence",
  page: "p.",

  // Category subtitles
  catPharmacySub: "Dosing and drug interactions",
  catPoliciesSub: "Clinical protocols and procedures",
  catQualitySub: "JCIA standards and patient safety goals",

  // Home
  homeTitle: "Nursing AI Assistant",
  homeTagline: "Clinical enquiry system",
  chooseCategory: "Choose a category",
  doseCalculator: "Dose calculator",
  badgeNew: "New",
  homeDisclaimer:
    "Answers are grounded in the uploaded documents. Consult the clinical team for critical decisions.",
  themeLight: "Light",
  themeDark: "Dark",
  themeAuto: "Auto",

  // Chat
  chatEmptyTitle: "How can I help?",
  chatEmptyBody: "Ask a question about {{category}} and I will answer from the approved documents",
  processing: "Processing…",
  queryRejected: "The query was rejected by the safety layer.",
  chatError: "Something went wrong handling your request. Please try again.",
  sugPharmacy1: "What is the amoxicillin dose for adults?",
  sugPharmacy2: "What are the drug interactions of warfarin?",
  sugPolicies1: "How do I apply the hand hygiene protocol?",
  sugPolicies2: "What is the fall risk assessment scale?",
  sugQuality1: "What are the IPSG patient safety goals?",
  sugQuality2: "How do we apply the surgical safety checklist?",
  doseBlockedShort: "Warning: unsafe dose — blocked",
  safetyAlertShort: "Safety alert active",
  dose: "Dose",
  drugInteractions: "Drug interactions",
  sourcesAndFiles: "Sources and files",
  listeningNow: "Listening… speak now",

  // Safety notice
  unverifiedDrugData: "Drug safety data is pending pharmacist review",
};

const ar: typeof en = {
  appTitle: "المساعد التمريضي",
  home: "الرئيسية",
  back: "رجوع",
  cancel: "إلغاء",
  admin: "مدير",
  adminPanel: "لوحة الإدارة",
  signOut: "تسجيل الخروج",
  loading: "جارٍ التحميل…",

  homeSubtitle: "اختر الفئة للحصول على إجابات مستندة إلى مصادر معتمدة",
  catPharmacy: "المستحضرات الصيدلانية",
  catPolicies: "سياسات التمريض",
  catQuality: "الجودة والسباحي",
  drugCalculator: "حاسبة الجرعات الدوائية",
  drugCalculatorSubtitle: "حساب الجرعة بالوزن مع فحوصات السلامة",

  signInRequired: "تسجيل الدخول مطلوب",
  signInBody:
    "يجب تسجيل الدخول بحسابك الشخصي. تُسجَّل كل استشارة سريرية باسم المستخدم في سجل التدقيق.",
  signIn: "تسجيل الدخول",
  signingIn: "جارٍ تسجيل الدخول…",
  signInNotConfigured: "لم يتم إعداد المصادقة في هذا الإصدار. راجع مسؤول النظام.",
  signInCancelled: "تم إلغاء تسجيل الدخول.",
  signInFailed: "فشل تبادل رمز الدخول مع الخادم.",
  signInNoToken: "لم يُصدر الخادم رمز جلسة.",
  signInUnreachable: "تعذّر الاتصال بخادم المصادقة.",

  accessDenied: "الوصول مرفوض",
  adminWebBlocked:
    "لوحة الإدارة غير متاحة على المتصفح. استخدم تطبيق الجوال مع التحقق البيومتري.",
  adminNoBiometrics:
    "يتطلب الوصول إلى لوحة الإدارة تسجيل بصمة أو بصمة وجه على هذا الجهاز.",
  adminAuthFailed: "تعذّر التحقق من الهوية. حاول مرة أخرى.",
  adminVerifying: "جارٍ التحقق من الهوية…",
  adminBiometricPrompt: "تحقق من هويتك للوصول إلى لوحة الإدارة",
  indexedDocumentsReadOnly: "الوثائق المفهرسة في المحرك السريري (للعرض فقط)",
  noIndexedDocuments: "لا توجد وثائق مفهرسة",
  documentsLoadFailed: "تعذّر تحميل الوثائق أو لا توجد وثائق مفهرسة",
  useWebToManage: "لإضافة أو حذف وثيقة، استخدم تطبيق الويب.",
  segments: "مقطع",

  askQuestion: "اكتب سؤالك هنا…",
  listening: "🎤 استمع…",
  stopRecording: "إيقاف التسجيل",
  speakQuestion: "تحدّث بسؤالك",
  clearChat: "مسح المحادثة",
  clearChatConfirm: "هل تريد مسح هذه المحادثة؟",
  clear: "مسح",
  engineUnreachable: "تعذّر الاتصال بالمحرك السريري.",
  sessionExpired: "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.",
  suggestionsTitle: "جرّب أن تسأل",

  calculatorTitle: "حاسبة الجرعات الدوائية",
  quickSelect: "اختر الدواء السريع",
  drugName: "اسم الدواء",
  drugNamePlaceholder: "مثال: Paracetamol",
  patientWeight: "وزن المريض (كيلوغرام) — اختياري",
  weightPlaceholder: "مثال: 70",
  calculate: "احسب الجرعة",
  querying: "جارٍ الاستعلام من المحرك السريري…",
  results: "نتائج الحاسبة",
  enterDrugName: "يرجى إدخال اسم الدواء",
  unexpectedError: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",

  doseBlocked: "❌ جرعة غير آمنة — تم الإيقاف",
  doseBlockedDefault:
    "الجرعة المحسوبة تتجاوز الحد الأقصى. تواصل مع الطبيب فوراً.",
  safetyAlertActive: "تنبيه سلامة نشط — راجع التنبيهات أدناه",
  calculatedDose: "الجرعة المحسوبة",
  indication: "الدواعي السريرية",
  clinicalAnswer: "الإجابة السريرية",
  safetyAlerts: "تنبيهات السلامة",
  contraindications: "موانع الاستخدام",
  nursingNotes: "ملاحظات التمريض",
  source: "المصدر",
  confidenceHigh: "ثقة عالية",
  confidenceMedium: "ثقة متوسطة",
  confidenceLow: "ثقة منخفضة",
  page: "ص",

  catPharmacySub: "الجرعات والتفاعلات الدوائية",
  catPoliciesSub: "البروتوكولات والإجراءات السريرية",
  catQualitySub: "معايير JCIA وأهداف سلامة المرضى",

  homeTitle: "مساعد التمريض الذكي",
  homeTagline: "نظام الاستفسار الطبي",
  chooseCategory: "اختر التصنيف",
  doseCalculator: "حاسبة الجرعات",
  badgeNew: "جديد",
  homeDisclaimer:
    "الإجابات مستندة إلى الوثائق المرفوعة. تواصل مع الطاقم الطبي للقرارات الحرجة.",
  themeLight: "نهاري",
  themeDark: "ليلي",
  themeAuto: "تلقائي",

  chatEmptyTitle: "كيف يمكنني مساعدتك؟",
  chatEmptyBody: "اطرح سؤالاً في {{category}} وسأجيبك استناداً إلى الوثائق المعتمدة",
  processing: "يعالج…",
  queryRejected: "تم رفض الاستعلام من طبقة السلامة.",
  chatError: "حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.",
  sugPharmacy1: "ما جرعة الأموكسيسيلين للبالغين؟",
  sugPharmacy2: "ما تداخلات الوارفارين الدوائية؟",
  sugPolicies1: "كيف أطبق بروتوكول نظافة اليدين؟",
  sugPolicies2: "ما مقياس تقييم خطر السقوط؟",
  sugQuality1: "ما هي أهداف سلامة المرضى IPSG؟",
  sugQuality2: "كيف نطبق قائمة تحقق السلامة الجراحية؟",
  doseBlockedShort: "تنبيه: جرعة غير آمنة — تم الإيقاف",
  safetyAlertShort: "تنبيه سلامة نشط",
  dose: "الجرعة",
  drugInteractions: "التفاعلات الدوائية",
  sourcesAndFiles: "المصادر والملفات",
  listeningNow: "جارٍ الاستماع… تحدّث الآن",

  unverifiedDrugData: "بيانات سلامة الأدوية قيد مراجعة الصيدلي",
};

const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? "ar";
// Arabic unless the device is explicitly English — this is an Arabic-first
// deployment, and defaulting the other way would be a regression for its users.
const initialLanguage = deviceLanguage === "en" ? "en" : "ar";

I18nManager.allowRTL(true);
I18nManager.forceRTL(initialLanguage === "ar");

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLanguage,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

export default i18n;
