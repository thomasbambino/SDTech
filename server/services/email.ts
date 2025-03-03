import formData from 'form-data';
import Mailgun from 'mailgun.js';

// Validate environment variables immediately
if (!process.env.MAILGUN_API_KEY) {
  throw new Error("MAILGUN_API_KEY environment variable must be set");
}
if (!process.env.MAILGUN_DOMAIN) {
  throw new Error("MAILGUN_DOMAIN environment variable must be set");
}

const mailgun = new Mailgun(formData);
const client = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
});

export class EmailService {
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      // Log attempt to send email
      console.log('Attempting to send email:', {
        to,
        from: 'SD Tech Pros <noreply@sdtechpros.com>',
        domain: process.env.MAILGUN_DOMAIN
      });

      const result = await client.messages.create(process.env.MAILGUN_DOMAIN, {
        from: 'SD Tech Pros <noreply@sdtechpros.com>',
        to: [to],
        subject,
        html,
      });

      console.log('Email sent successfully:', result);
      return true;
    } catch (error) {
      console.error('Error sending email:', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        details: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, tempPassword: string): Promise<boolean> {
    const subject = 'Your Temporary Password - SD Tech Pros';
    const html = `
      <h2>Password Reset</h2>
      <p>Your account password has been reset. Here is your temporary password:</p>
      <p style="font-size: 18px; font-weight: bold; padding: 10px; background: #f5f5f5; border-radius: 4px;">
        ${tempPassword}
      </p>
      <p>Please log in with this temporary password and change it immediately.</p>
      <p>For security reasons, this temporary password will expire in 24 hours.</p>
      <p>If you did not request this password reset, please contact support immediately.</p>
      <br>
      <p>Best regards,<br>SD Tech Pros Team</p>
    `;
    return this.sendEmail(email, subject, html);
  }
}

export const emailService = new EmailService();