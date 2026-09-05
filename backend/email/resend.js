const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;

const getClient = () => {
  if (!resendApiKey) throw new Error('RESEND_API_KEY is required');
  return new Resend(resendApiKey);
};

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const deliver = async (payload) => {
  const result = await getClient().emails.send(payload);
  if (result?.error) {
    const error = new Error('E-mail provider rejected the message');
    error.code = result.error.name || 'EMAIL_PROVIDER_ERROR';
    throw error;
  }
  return result?.data || null;
};

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  if (!resendFrom) throw new Error('RESEND_FROM is required');
  await deliver({
    from: resendFrom,
    to,
    subject: 'Redefinição de senha',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Redefinição de senha</h2>
        <p>Use o botão abaixo para redefinir sua senha. Este link expira em breve.</p>
        <p><a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Redefinir senha</a></p>
        <p>Se você não solicitou isso, ignore este e-mail.</p>
      </div>`,
    text: `Redefina sua senha em: ${resetLink}`,
  });
};

const sendClientInviteEmail = async ({ to, companyName, invitationLink, expiresInHours }) => {
  if (!resendFrom) throw new Error('RESEND_FROM is required');
  const safeCompanyName = escapeHtml(companyName);
  const safeEmail = escapeHtml(to);
  const safeInvitationLink = escapeHtml(invitationLink);
  await deliver({
    from: resendFrom,
    to,
    subject: `Você foi convidado para Lambda Pulse — ${companyName}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;line-height:1.55">
        <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px">
          <p style="margin:0 0 8px;color:#4f46e5;font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase">Lambda Pulse</p>
          <h2 style="margin:0 0 16px;font-size:24px">Seu acesso está pronto</h2>
          <p>Você foi convidado para acessar o ambiente de <strong>${safeCompanyName}</strong>.</p>
          <p><strong>E-mail:</strong> ${safeEmail}</p>
          <p>Crie sua própria senha pelo botão abaixo. O administrador não conhece e não receberá sua senha.</p>
          <p><a href="${safeInvitationLink}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Aceitar convite</a></p>
          <p style="color:#64748b;font-size:13px">Este link é individual, só pode ser usado uma vez e expira em ${Number(expiresInHours)} horas. Se você não esperava este convite, ignore esta mensagem.</p>
        </div>
      </div>`,
    text: `Você foi convidado para o Lambda Pulse de ${companyName}. Defina sua senha em: ${invitationLink}. O link expira em ${Number(expiresInHours)} horas.`,
  });
};

const sendCompanyDiscoveryEmail = async ({ to, companyNames, loginLink }) => {
  if (!resendFrom) throw new Error('RESEND_FROM is required');
  const companyList = companyNames.map(name => `<li>${escapeHtml(name)}</li>`).join('');
  await deliver({
    from: resendFrom,
    to,
    subject: 'Seus acessos no Lambda Pulse',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Seus acessos no Lambda Pulse</h2>
        <p>Estas são as empresas associadas ao seu e-mail:</p>
        <ul>${companyList}</ul>
        <p><a href="${escapeHtml(loginLink)}">Acessar o Lambda Pulse</a></p>
        <p style="color:#64748b;font-size:13px">Se você não solicitou esta informação, ignore a mensagem.</p>
      </div>`,
    text: `Empresas associadas ao seu e-mail: ${companyNames.join(', ')}. Acesse: ${loginLink}`,
  });
};

module.exports = { sendPasswordResetEmail, sendClientInviteEmail, sendCompanyDiscoveryEmail, escapeHtml };
