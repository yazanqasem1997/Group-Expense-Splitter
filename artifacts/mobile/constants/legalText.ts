import { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION, SUPPORT_EMAIL } from "./brand";

/** Shared by the in-app legal screens and the public web pages Apple links to. */
export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };
export const LEGAL_META = { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION, SUPPORT_EMAIL };

export const privacySections: LegalSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      `Split Mate is a shared-expense app operated by ${OPERATOR_DESCRIPTION} (“Split Mate,” “we,” “us”). This Privacy Policy explains what information Split Mate collects, why, who it is shared with, and the choices you have.`,
      `For privacy questions or requests, contact ${SUPPORT_EMAIL}. You can also email to unsubscribe from invitation or reminder emails, or use the “Stop these emails” link at the bottom of any of them.`,
    ],
  },
  {
    heading: "2. Information you give us",
    bullets: [
      "Account details: your name, email address, profile photo, and the sign-in method you use (email, Apple, or Google).",
      "Groups and friends: group names and settings, members, invitations, friend requests and their status.",
      "Expenses and payments: amounts, currencies, dates, descriptions, categories, who paid, how it was split, recurring schedules, notes, comments, reactions, and the edit history of each record.",
      "Messages you send in a group and your notification settings.",
      "Receipt photos you scan and the receipt details you review or save.",
      "Contacts, only if you tap Find friends and allow access: email addresses from your contacts are checked once against existing Split Mate accounts. Contact names and phone numbers stay on your device, and the submitted email list is not stored or logged.",
      "Preferences such as your default currency and appearance.",
    ],
  },
  {
    heading: "3. Information collected automatically",
    paragraphs: [
      "To run and secure the app we receive technical information such as device type, app version, sign-in events, error reports, and sync status. If you turn on notifications, we receive a push-notification token for your device.",
      "Some data is cached on your device so the app opens quickly and works offline. If you turn on Face ID or fingerprint unlock, the check is done by your phone; Split Mate never receives your biometric data.",
      "Split Mate does not use your location, does not show advertising, and does not sell personal information.",
    ],
  },
  {
    heading: "4. How we use information",
    bullets: [
      "To create your account and keep it secure.",
      "To run groups: sync expenses and payments, calculate balances and suggested settlements, and show activity to group members.",
      "To read receipt photos and pre-fill the items and totals for you to check.",
      "To send invitations, reminders, and the notifications you turn on.",
      "To convert amounts between currencies for display, using daily reference exchange rates. The original amount and currency of every expense are always kept.",
      "To fix problems, prevent abuse, keep the service reliable, answer support requests, and meet legal obligations.",
    ],
  },
  {
    heading: "5. Who we share information with",
    paragraphs: [
      "People in your groups can see what you add to that group, such as expenses, payments, receipts, messages, and activity. Check who is in a group before adding something sensitive.",
      "We use the following service providers, who process information only to provide their service to us:",
    ],
    bullets: [
      "Clerk — account sign-in and identity, including Sign in with Apple and Google sign-in when you choose them.",
      "Replit (running on Google Cloud) — app hosting, the database, and storage for receipt photos and profile pictures.",
      "Anthropic (Claude) — reads the receipt photos you scan to extract items and totals. Under Anthropic's commercial terms, data sent through its API is not used to train its models.",
      "Google (Gmail) — sends invitation and account emails.",
      "ExchangeRate-API — provides daily reference exchange rates. Requests to it contain no personal information.",
      "Expo, Apple and Google push services — deliver notifications to your device if you enable them.",
        "Apple App Store and Google Play — process payments for Plus and Trip Pass. We never see your card details.",
    ],
  },
  {
    heading: "6. Receipts and sensitive details",
    paragraphs: [
      "Receipt photos can show where and when you shopped and what you bought. Only scan receipts you are happy to share with your group, and crop out anything you don't need.",
      "Split Mate is not built to hold card numbers, bank passwords, ID numbers, or other credentials. Please don't enter them in expenses, notes, messages, or receipts.",
    ],
  },
  {
    heading: "7. How long we keep information",
    paragraphs: [
      "We keep your information while your account is active and as needed to provide the service, resolve disputes, and meet legal obligations. Receipt photos are kept with the group's records until the receipt, expense, or group is deleted.",
      "You can delete your account from the app. There is a 30-day recovery period; after that your profile and the groups you own are permanently deleted. In groups owned by other people, your past expenses stay so their balances remain correct, but they are detached from your account.",
    ],
  },
  {
    heading: "8. Security",
    paragraphs: [
      "We use reasonable technical and organisational measures to protect your information, including encrypted connections. No online service can be perfectly secure, so keep your sign-in details private and tell us if you suspect someone has accessed your account.",
    ],
  },
  {
    heading: "9. Your rights",
    paragraphs: [
      `Depending on where you live — including under the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and, for users in the EU or UK, the GDPR — you may have the right to access, correct, delete, or export your information, and to object to or restrict certain uses. You can edit most information in the app, or email ${SUPPORT_EMAIL}. We may need to confirm your identity first.`,
      "You can also complain to the data-protection authority where you live.",
    ],
  },
  {
    heading: "10. Children",
    paragraphs: [
      "You must be at least 13 years old to use Split Mate (16 in the European Union and the United Kingdom, or the higher minimum age where you live). If you are under 18, you need permission from a parent or guardian, who is responsible for your use of the app.",
      `We do not knowingly collect information from children under 13. If you believe a child under 13 has created an account, contact ${SUPPORT_EMAIL} and we will delete it.`,
    ],
  },
  {
    heading: "11. International transfers",
    paragraphs: [
      "Our service providers may store and process information outside the UAE, including in the United States and the European Union. Where the law requires it, we rely on appropriate safeguards for these transfers.",
    ],
  },
  {
    heading: "12. Changes to this policy",
    paragraphs: [
      "We will update this policy when the app or the law changes, change the date at the top, and tell you in the app about important changes.",
    ],
  },
];

export const termsSections: LegalSection[] = [
  {
    heading: "1. Agreement",
    paragraphs: [
      `These Terms govern your use of Split Mate, a shared-expense app operated by ${OPERATOR_DESCRIPTION} (“Split Mate,” “we,” “us”). By creating an account or using the app you agree to these Terms and to our Privacy Policy. If you don't agree, please don't use Split Mate.`,
    ],
  },
  {
    heading: "2. What Split Mate is — and isn't",
    paragraphs: [
      "Split Mate helps you record shared expenses, split costs, track who owes whom, record payments you have made to each other, manage recurring expenses, message your group, and scan receipts.",
      "Split Mate is a record-keeping tool. It is not a bank, payment service, lender, or financial, tax, or legal adviser, and it never holds or moves money. Payments between people happen outside the app.",
    ],
  },
  {
    heading: "3. Who can use Split Mate",
    paragraphs: [
      "You must be at least 13 years old (16 in the European Union and the United Kingdom, or the higher minimum age where you live). If you are under 18, you may only use Split Mate with the permission of a parent or guardian, who accepts these Terms on your behalf and is responsible for your use of the app.",
      "You are responsible for keeping your account secure and for activity on it. Tell us promptly if you think someone else has accessed it.",
    ],
  },
  {
    heading: "4. Your groups and your content",
    paragraphs: [
      "You are responsible for what you add to Split Mate — expenses, receipts, messages, names, and photos — and for having the right to share other people's information. Everything you add to a group is visible to that group's members.",
      "You keep ownership of your content. You allow us to store, process, display, and back it up only as needed to run, secure, and support the app.",
    ],
  },
  {
    heading: "5. Balances and currency conversion",
    paragraphs: [
      "Balances and suggested settlements are calculated from the information members enter. Please check amounts before paying anyone.",
      "Every expense keeps its original amount and currency. When a group shows totals in another currency, Split Mate converts them using daily reference exchange rates from a third-party provider, so converted figures can change as rates move and may differ from the rate your bank uses. We are not responsible for losses caused by exchange-rate differences, unavailable rates, or incorrect entries.",
    ],
  },
  {
    heading: "6. Receipt scanning",
    paragraphs: [
      "Receipt photos are read automatically by an AI service (Anthropic's Claude) to suggest items and totals. Automated reading can make mistakes, so always review the details before saving an expense.",
    ],
  },
  {
    heading: "7. Acceptable use",
    paragraphs: ["Use Split Mate lawfully and respectfully. In particular, don't:"],
    bullets: [
      "use it for fraud, harassment, or to collect other people's information without permission;",
      "upload illegal, abusive, or infringing content;",
      "try to access other people's accounts or data, or probe, overload, scrape, reverse-engineer, or bypass the app's security;",
      "impersonate someone or send misleading invitations or messages.",
    ],
  },
  {
    heading: "8. Availability and changes",
    paragraphs: [
      "We work to keep Split Mate running, but it may sometimes be unavailable or contain errors. We may add, change, or remove features.",
      "We may update these Terms. We will change the date at the top and tell you in the app about important changes. Continuing to use Split Mate after that means you accept the updated Terms.",
    ],
  },
  {
    heading: "9. Suspension and deleting your account",
    paragraphs: [
      "We may suspend or restrict an account where reasonably necessary to protect users or the app, or if these Terms are seriously breached. You can stop using Split Mate at any time.",
      "You can delete your account in the app. There is a 30-day recovery period; after that your profile and the groups you own are permanently deleted, while your past entries in other people's groups stay (detached from your account) so their balances remain correct.",
    ],
  },
  {
    heading: "10. Disclaimers and liability",
    paragraphs: [
      "Split Mate is provided “as is” and “as available.” To the extent the law allows, we do not guarantee that it will always be available or that calculations, conversions, or receipt readings will be error-free.",
      "To the extent the law allows, we are not liable for indirect or consequential losses, or for lost profits or data. Our total liability for any claim relating to Split Mate is limited to the greater of the amount you paid us in the 12 months before the claim or USD 100. Nothing in these Terms limits liability that cannot be limited by law.",
    ],
  },
  {
    heading: "11. Governing law",
    paragraphs: [
      "These Terms are governed by the laws of the United Arab Emirates. Disputes will be handled by the competent courts of the United Arab Emirates, without affecting any mandatory consumer protections you have where you live.",
    ],
  },
  {
    heading: "12. Plus, Trip Pass, renewals and refunds",
    paragraphs: [
      "Split Mate Plus is a subscription billed monthly or yearly through your Apple App Store or Google Play account. It renews automatically at the price shown before you buy unless you cancel at least 24 hours before the end of the current period. You can cancel anytime in your App Store or Google Play subscription settings; you keep Plus until the period you paid for ends.",
      "The free trial lasts 7 days and includes up to 30 receipt scans. If you don't cancel before it ends, it becomes a paid subscription at the price shown when you started it. You are only offered one free trial.",
      "A Trip Pass is a one-time purchase that gives one group Plus for 30 days from when you use it. It does not renew. Unused passes stay in your account.",
      "Payments, refunds and billing questions are handled by Apple or Google under their own refund policies. To ask for a refund, use reportaproblem.apple.com or Google Play's refund request. We do not charge any fees beyond the price shown in the store.",
    ],
  },
  {
    heading: "13. Contact",
    paragraphs: [`Questions about these Terms? Email ${SUPPORT_EMAIL}.`],
  },
];
