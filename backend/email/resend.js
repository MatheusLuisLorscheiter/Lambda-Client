const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;

const getClient = () => {
    if (!resendApiKey) {
        throw new Error('RESEND_API_KEY is required');
    }
    return new Resend(resendApiKey);
};

const sendPasswordResetEmail = async ({ to, resetLink }) => {
    if (!resendFrom) {
        throw new Error('RESEND_FROM is required');
    }

    const resend = getClient();
    await resend.emails.send({
        from: resendFrom,
        to,
        subject: 'Reset your password',
        html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Password reset</h2>
        <p>Click the button below to reset your password. This link expires soon.</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
            Reset password
          </a>
        </p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `
    });
};

const sendClientInviteEmail = async ({ to, companyName, loginLink }) => {
    if (!resendFrom) {
        throw new Error('RESEND_FROM is required');
    }

    const resend = getClient();
    await resend.emails.send({
        from: resendFrom,
        to,
        subject: `You have been invited to ${companyName}`,
        html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Welcome to ${companyName}</h2>
        <p>You have been invited to access the Lambda monitoring dashboard.</p>
        <p><strong>Login email:</strong> ${to}</p>
        <p>Use the password provided by your administrator. If you need to set a new password, use the “Forgot password” option.</p>
        <p>
          <a href="${loginLink}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
            Go to login
          </a>
        </p>
        <p>If you were not expecting this invite, you can ignore this email.</p>
      </div>
    `
    });
};

module.exports = {
  sendPasswordResetEmail,
  sendClientInviteEmail
};
