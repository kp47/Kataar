const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

/**
 * Sends the magic-link login email. If no SMTP is configured (local dev),
 * the link is printed to the server console instead so you can develop
 * without setting up email first.
 */
async function sendMagicLinkEmail({ to, link, businessName }) {
  const subject = businessName
    ? `Your QueueWise link for ${businessName}`
    : 'Your QueueWise sign-in link';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Sign in to QueueWise</h2>
      <p>Tap the button below to sign in${businessName ? ` and get your token for <strong>${businessName}</strong>` : ''}. This link expires in 15 minutes and can only be used once.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#F2A93B;color:#10151C;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Sign in</a>
      </p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  if (!transporter) {
    console.log('\n[mailer:dev-mode] SMTP not configured. Magic link for', to, ':\n', link, '\n');
    return { devMode: true };
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM || 'QueueWise <no-reply@queuewise.app>',
    to,
    subject,
    html,
  });
}

module.exports = { sendMagicLinkEmail };
