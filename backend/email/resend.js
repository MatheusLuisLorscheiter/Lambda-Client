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
        subject: 'Redefinição de senha',
        html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Redefinição de senha</h2>
        <p>Clique no botão abaixo para redefinir sua senha. Este link expira em breve.</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
            Redefinir senha
          </a>
        </p>
        <p>Se você não solicitou isso, pode ignorar este e-mail.</p>
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
        subject: `Você foi convidado para Lambda Pulse - ${companyName}`,
        html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Bem-vindo à Lambda Pulse</h2>
        <p>Você foi convidado para acessar o painel de monitoramento Lambda Pulse da empresa ${companyName}.</p>
        <p><strong>E-mail de login:</strong> ${to}</p>
        <p>Use a senha enviada pelo administrador. Se precisar definir uma nova senha, utilize a opção “Esqueci minha senha”.</p>
        <p>
          <a href="${loginLink}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
            Ir para o login
          </a>
        </p>
        <p>Se você não esperava esse convite, pode ignorar este e-mail.</p>
      </div>
    `
    });
};

module.exports = {
  sendPasswordResetEmail,
  sendClientInviteEmail
};
