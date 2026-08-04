const SibApiV3Sdk = require('@getbrevo/brevo');

const brevo = new SibApiV3Sdk.TransactionalEmailsApi();

brevo.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

async function enviarEmail(para, assunto, texto, html = null) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('BREVO_API_KEY ou EMAIL_FROM ausente; email nao enviado.');
    return { ok: false, reason: 'config' };
  }

  try {
    await brevo.sendTransacEmail({
      sender: {
        name: 'FormulaVest',
        email: process.env.EMAIL_FROM
      },
      to: [
        {
          email: para
        }
      ],
      subject: assunto,
      textContent: texto,
      htmlContent: html || `<p>${texto}</p>`
    });

    return { ok: true };
  } catch (error) {
    console.warn('Erro ao enviar email:', error?.response?.data || error.message);
    return { ok: false, reason: 'provider', error };
  }
}

module.exports = {
  enviarEmail
};
