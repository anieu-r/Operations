/**
 * Email notifications for form submissions.
 *
 * Uses nodemailer over SMTP. Configure via environment variables and it sends
 * real email; leave it unconfigured and it logs a notice instead (so the app
 * always works — submissions are still saved either way).
 *
 * Configure with EITHER:
 *   SMTP_URL=smtp://user:pass@host:port        (one-liner, e.g. for most providers)
 * OR the discrete fields:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS
 *
 * Then:
 *   NOTIFY_EMAIL  where submission alerts are sent (default: the business inbox)
 *   MAIL_FROM     the From address (default: SMTP_USER or no-reply@auswise.local)
 *
 * Gmail tip: create an App Password (with 2FA on) and use
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
 *   SMTP_USER=you@gmail.com   SMTP_PASS=<app password>
 */

import nodemailer from 'nodemailer';

const DEFAULT_TO = 'anmolr1098@gmail.com';

let transporter = null;
let configured = false;

function init() {
  if (transporter || configured) return;
  configured = true;
  try {
    if (process.env.SMTP_URL) {
      transporter = nodemailer.createTransport(process.env.SMTP_URL);
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
  } catch (err) {
    console.warn('[notify] SMTP init failed, falling back to log-only:', err.message);
    transporter = null;
  }
}

export function isEmailConfigured() {
  init();
  return Boolean(transporter);
}

function recipient() {
  return process.env.NOTIFY_EMAIL || DEFAULT_TO;
}
function from() {
  return process.env.MAIL_FROM || process.env.SMTP_USER || 'AusWise Migration <no-reply@auswise.local>';
}

/**
 * Fire-and-forget notification. Never throws — a mail failure must not break a
 * form submission. Returns true if an email was actually dispatched.
 */
export async function notify(subject, lines) {
  init();
  const body = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');
  if (!transporter) {
    console.log(`[notify:log-only] ${subject}\n${body}\n`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: from(),
      to: recipient(),
      subject: `[AusWise] ${subject}`,
      text: body,
    });
    return true;
  } catch (err) {
    console.warn('[notify] send failed (submission still saved):', err.message);
    return false;
  }
}

/** Build a readable notification from a saved submission record. */
export function notifySubmission(kind, record) {
  const label = { application: 'New visa enquiry', contact: 'New contact message', sop: 'New SOP draft generated' }[kind] || 'New submission';
  const lines = [
    `${label}`,
    `Reference: ${record.reference || '-'}`,
    record.name ? `Name: ${record.name}` : '',
    record.fullName ? `Name: ${record.fullName}` : '',
    record.email ? `Email: ${record.email}` : '',
    record.phone ? `Phone: ${record.phone}` : '',
    record.nationality ? `Nationality: ${record.nationality}` : '',
    record.visaName ? `Visa: ${record.visaName} (${record.visaCode})` : record.visaCode ? `Visa: ${record.visaCode}` : '',
    record.location ? `Location: ${record.location}` : '',
    record.purpose ? `SOP purpose: ${record.purpose}` : '',
    record.message ? `\nMessage:\n${record.message}` : '',
    `\nReceived: ${record.createdAt || new Date().toISOString()}`,
  ];
  return notify(label, lines);
}
