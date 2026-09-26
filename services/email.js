const nodemailer = require('nodemailer');

const isProduction = process.env.NODE_ENV === 'production';

function statusEmail() {
  if (process.env.EMAIL_PROVIDER === 'console' && !isProduction) return { configured: true, provider: 'console' };
  return {
    configured: Boolean(process.env.OUTLOOK_EMAIL && process.env.OUTLOOK_APP_PASSWORD),
    provider: 'outlook-smtp'
  };
}

function criarTransportadorOutlook() {
  return nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: {
      user: process.env.OUTLOOK_EMAIL,
      pass: process.env.OUTLOOK_APP_PASSWORD
    }
  });
}

async function enviarEmail(para, assunto, texto, html = null) {
  const shouldUseConsoleFallback = !isProduction || process.env.EMAIL_PROVIDER === 'console';

  if (process.env.EMAIL_PROVIDER === 'console' && !isProduction) {
    console.info(`[email de desenvolvimento] para=${para} assunto=${assunto} conteudo=${texto}`);
    return { ok: true, simulated: true };
  }

  if (!process.env.OUTLOOK_EMAIL || !process.env.OUTLOOK_APP_PASSWORD) {
    if (shouldUseConsoleFallback) {
      console.info(`[email de desenvolvimento] para=${para} assunto=${assunto} conteudo=${texto}`);
      return { ok: true, simulated: true, reason: 'config-fallback' };
    }
    console.warn('Serviço de email não configurado; email não enviado.');
    return { ok: false, reason: 'config' };
  }

  try {
    const info = await criarTransportadorOutlook().sendMail({
      from: `FormulaVest <${process.env.OUTLOOK_EMAIL}>`,
      to: [para],
      subject: assunto,
      text: texto,
      html: html || `<p>${texto.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    });

    return { ok: true, id: info.messageId };
  } catch (error) {
    const message = String(error?.message || error || '');
    console.warn('Erro ao enviar email:', message);

    if (shouldUseConsoleFallback || /smtp.*auth|smtpauth|authentication.*disabled|530/i.test(message)) {
      console.info(`[email de desenvolvimento] para=${para} assunto=${assunto} conteudo=${texto}`);
      return { ok: true, simulated: true, reason: 'provider-fallback' };
    }

    return { ok: false, reason: 'provider' };
  }
}

module.exports = {
  enviarEmail,
  statusEmail
};
