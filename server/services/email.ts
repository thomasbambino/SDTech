import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY!,
});

export class EmailService {
  private async sendEmail(to: string, subject: string, html: string) {
    try {
      const result = await mg.messages.create(process.env.MAILGUN_DOMAIN!, {
        from: `SD Tech Pros <noreply@${process.env.MAILGUN_DOMAIN}>`,
        to: [to],
        subject,
        html,
      });
      console.log('Email sent successfully:', result);
      return result;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, tempPassword: string) {
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
