# Account Tab Map

This is the current Account experience map for developer handoff.

## Entry point

```text
Avatar button
└── Account drawer
    ├── Account home
    └── Settings sub-screens
```

The Account route is hidden from the visible bottom tab bar. The avatar button opens
`AccountDrawer`, which renders the Account screen inside a right-side sliding panel.

## Account drawer

### Shared behavior

- Opens as a native transparent modal with a dimmed backdrop.
- Slides in from the right.
- Width is approximately 86% of the screen.
- Tapping the backdrop or the close button closes the drawer.
- The drawer resets to Account home after it closes.
- Sub-screens render their own back header.

### Account home

```text
Account
├── Profile card
│   ├── Avatar
│   │   ├── Tap: choose profile photo
│   │   └── If a photo exists: Remove photo
│   ├── Display name
│   │   └── Tap: edit inline
│   └── Save name on blur or keyboard submit
│
├── Settings
│   ├── Notifications
│   │   └── Shows enabled notification count
│   ├── Appearance
│   │   └── Shows Light or Dark
│   ├── Security
│   │   └── Shows biometric status
│   ├── Preferences
│   │   └── Shows the default currency
│   └── Exchange Rates
│       └── Shows last refresh status
│
├── More
│   ├── Load sample data
│   │   └── Adds demo groups, expenses, and settlements
│   └── Sign Out
│       └── Confirmation alert, then clears local login state
│
└── Footer
    ├── Ledger v1.0.0
    └── Copyright line
```

## Settings routes

```text
/settings/notifications
├── Expense added notifications
├── Settlement notifications
├── Group invite notifications
└── Comment notifications

/settings/appearance
├── Light / Dark appearance
└── Theme persistence

/settings/security
├── Biometric availability
├── Biometric enable/disable
└── Biometric unlock flow

/settings/preferences
└── Default currency picker

/settings/exchange-rates
├── Current exchange-rate status
├── Last refreshed time
└── Manual refresh action
```

## Navigation model

```text
Account home
├── Notifications ──┐
├── Appearance      │
├── Security        │  onBack → Account home
├── Preferences     │
└── Exchange Rates ┘

Any settings screen
└── Main navigation action → close drawer, then navigate to the requested app route
```

The drawer uses an internal `subRoute` state for the settings screens. The normal
Account tab component can also render as a full screen, while the drawer passes
`inDrawer` and navigation callbacks to reuse the same content.

## Data and state dependencies

| Area | State / action |
| --- | --- |
| Profile | `currentUser`, `updateCurrentUser` |
| Notifications | `notifPrefs`, `updateNotifPref` |
| Appearance | Theme context and persisted appearance setting |
| Security | Biometric context |
| Preferences | `defaultCurrency`, `setDefaultCurrency` |
| Exchange rates | `exchangeRates`, `ratesUpdated`, `fetchExchangeRates` |
| Demo data | `api.seedDemoData()` |
| Sign out | Removes the local login marker, then returns to the landing screen |

## Moved control

**Simplify Debts** is no longer in Account → Preferences.

It now lives directly below the balance card on the Groups screen:

```text
Groups
└── Balance card
    └── Simplify debts switch
        ├── On: merged debt relations / fewer payments
        └── Off: each expense debt shown separately
```

The setting remains persisted through the existing app context and continues to
control the balance calculation; only its UI location changed.