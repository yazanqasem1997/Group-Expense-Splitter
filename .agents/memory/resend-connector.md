---
name: Email delivery
description: How this project sends invitation email when managed connectors are unavailable.
---

Use Gmail SMTP from API-server code with a Gmail App Password stored in Replit Secrets when the managed Gmail connector is unavailable. Do not handle a raw password in application code or logs.

**Why:** Both the Resend and Gmail managed connections reported missing-connection errors at runtime, while Gmail SMTP remains available without a custom domain or Replit connector attachment.

**How to apply:** Configure `GMAIL_SMTP_USER` as the Gmail address and `GMAIL_SMTP_APP_PASSWORD` as a Replit Secret. Use `smtp.gmail.com` on port 587 with STARTTLS, and keep the sender equal to the authenticated Gmail user.