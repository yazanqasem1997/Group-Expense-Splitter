import nodemailer from "nodemailer";
import { logger } from "./logger";
import { isOptedOut, unsubscribeUrl } from "./unsubscribe";
const OPEN_URL = `${(process.env.PUBLIC_APP_URL || "https://api.infosplitmate.com").replace(/\/$/, "")}/api/open`;

type GroupInvitationEmail = {
  to: string;
  invitedName?: string | null;
  inviterName: string;
  groupName: string;
};

type AppInvitationEmail = {
  to: string;
  invitedName?: string | null;
  inviterName: string;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assertSafeHeaderValue(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
}

function requiredSmtpConfig(): { user: string; appPassword: string } {
  const user = (
    process.env.GMAIL_SMTP_USER?.trim() ||
    process.env.GMAIL_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim()
  );
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    throw new Error(
      "A valid GMAIL_SMTP_USER, GMAIL_FROM_EMAIL, or RESEND_FROM_EMAIL is not configured",
    );
  }
  if (!appPassword) {
    throw new Error("GMAIL_SMTP_APP_PASSWORD is not configured");
  }

  return { user, appPassword };
}

/**
 * Send through Gmail's free SMTP service using a Google App Password.
 * The app password is read from Replit Secrets and is never logged or sent
 * anywhere except Gmail's authenticated SMTP connection.
 */
async function sendGmailEmail(message: EmailMessage): Promise<void> {
  // People who unsubscribed get nothing more; everyone else gets a working unsubscribe link.
  if (await isOptedOut(message.to)) return;
  const unsub = unsubscribeUrl(message.to);
  message = {
    ...message,
    text: `${message.text}\n\n---\nSplit Mate · support@infosplitmate.com\nNotification settings: ${OPEN_URL}?to=settings/notifications\nDon't want these emails? Unsubscribe: ${unsub}`,
    html: `${message.html}<p style="font-size:12px;color:#7D9599;margin-top:24px">Split Mate · <a href="mailto:support@infosplitmate.com" style="color:#7D9599">support@infosplitmate.com</a><br><a href="${OPEN_URL}?to=settings/notifications" style="color:#7D9599">Notification settings</a> · Don't want these emails? <a href="${unsub}" style="color:#7D9599">Stop these emails</a></p>`,
  };
  // Preferred: send over HTTPS with Resend (works where SMTP ports are blocked, e.g. Railway).
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    assertSafeHeaderValue(message.to, "recipient");
    const fromAddr = (process.env.RESEND_FROM_EMAIL || process.env.SUPPORT_EMAIL_ALIAS || "").trim();
    const replyAddr = (process.env.SUPPORT_EMAIL_ALIAS || fromAddr).trim();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Split Mate <${fromAddr}>`,
        to: [message.to],
        reply_to: replyAddr,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status, recipient: message.to }, "Resend rejected email");
      throw new Error("Resend rejected the email");
    }
    return;
  }

  const { user, appPassword } = requiredSmtpConfig();
  assertSafeHeaderValue(message.to, "recipient");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass: appPassword },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      // Shown as the support address; Gmail uses it when it is set up under "Send mail as" for this account.
      from: `Split Mate <${(process.env.SUPPORT_EMAIL_ALIAS || "support@infosplitmate.com").trim()}>`,
      replyTo: (process.env.SUPPORT_EMAIL_ALIAS || "support@infosplitmate.com").trim(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    logger.error(
      { err: error, recipient: message.to },
      "Gmail SMTP rejected invitation email",
    );
    throw new Error("Gmail SMTP rejected the invitation email");
  } finally {
    transporter.close();
  }
}

export async function sendGroupInvitationEmail({
  to,
  invitedName,
  inviterName,
  groupName,
}: GroupInvitationEmail): Promise<void> {
  const recipient = invitedName?.trim() || to;
  const safeRecipient = escapeHtml(recipient);
  const safeInviter = escapeHtml(inviterName || "Someone");
  const safeGroup = escapeHtml(groupName);

  await sendGmailEmail({
    to,
    subject: `${inviterName || "Someone"} invited you to join ${groupName} on Split Mate`,
    text: [
      `Hi ${recipient},`,
      "",
      `${inviterName || "Someone"} invited you to join the "${groupName}" group on Split Mate.`,
      "Open Split Mate and sign in with this email address to see and accept the invitation.",
      "",
      `Open Split Mate: ${OPEN_URL}`,
        "",
        "— The Split Mate team",
    ].join("\n"),
    html: `
      <div style="background:#f5f7fa;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 8px 30px rgba(23,32,51,.08)">
          <div style="font-size:22px;font-weight:700;color:#0b5cad;margin-bottom:24px">Split Mate</div>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Hi ${safeRecipient},</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px">
            <strong>${safeInviter}</strong> invited you to join the
            <strong>${safeGroup}</strong> group on Split Mate.
          </p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
            Open Split Mate and sign in with this email address to see and accept the invitation.
          </p>
          <p style="margin:0 0 24px"><a href="${OPEN_URL}" style="display:inline-block;background:#0b5cad;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Open Split Mate</a></p>
          <p style="font-size:14px;line-height:1.6;color:#667085;margin:0">— The Split Mate team</p>
        </div>
      </div>
    `,
  });
}

export async function sendAppInvitationEmail({
  to,
  invitedName,
  inviterName,
}: AppInvitationEmail): Promise<void> {
  const recipient = invitedName?.trim() || to;
  const safeRecipient = escapeHtml(recipient);
  const safeInviter = escapeHtml(inviterName || "Someone");

  await sendGmailEmail({
    to,
    subject: `${inviterName || "Someone"} invited you to join Split Mate`,
    text: [
      `Hi ${recipient},`,
      "",
      `${inviterName || "Someone"} invited you to join Split Mate.`,
      "Open Split Mate and sign in with this email address to get started.",
      "",
      `Open Split Mate: ${OPEN_URL}`,
        "",
        "— The Split Mate team",
    ].join("\n"),
    html: `
      <div style="background:#f5f7fa;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 8px 30px rgba(23,32,51,.08)">
          <div style="font-size:22px;font-weight:700;color:#0b5cad;margin-bottom:24px">Split Mate</div>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Hi ${safeRecipient},</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 16px">
            <strong>${safeInviter}</strong> invited you to join Split Mate.
          </p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
            Open Split Mate and sign in with this email address to get started.
          </p>
          <p style="margin:0 0 24px"><a href="${OPEN_URL}" style="display:inline-block;background:#0b5cad;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Open Split Mate</a></p>
          <p style="font-size:14px;line-height:1.6;color:#667085;margin:0">— The Split Mate team</p>
        </div>
      </div>
    `,
  });
}