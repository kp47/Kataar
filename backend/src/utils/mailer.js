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
 * Sends the sign-in OTP email. If no SMTP is configured (local dev),
 * the code is printed to the server console instead so you can develop
 * without setting up email first.
 */
async function sendOtpEmail({ to, code, businessName }) {
  const subject = businessName
    ? `Your QueueWise code for ${businessName}`
    : 'Your QueueWise sign-in code';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Sign in to QueueWise</h2>
      <p>Enter this code to sign in${businessName ? ` and get your token for <strong>${businessName}</strong>` : ''}. It expires in 10 minutes and can only be used once.</p>
      <p style="margin:28px 0;font-size:32px;font-weight:bold;letter-spacing:6px;color:#10151C;background:#F2A93B;padding:16px 24px;border-radius:6px;text-align:center">${code}</p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  if (!transporter) {
    console.log('\n[mailer:dev-mode] SMTP not configured. OTP code for', to, ':', code, '\n');
    return { devMode: true };
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM || 'QueueWise <no-reply@queuewise.app>',
    to,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };
