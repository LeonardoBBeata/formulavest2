const axios = require('axios');

const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const EMAIL_TIMEOUT_MS = 10000;

function providerName() {
  return (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
}

function simulatedDeliveryAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.TEMPORARY_OTP_DISPLAY === 'true';
}

function statusEmail() {
  const provider = providerName();
  if (provider === 'console') {
    const simulated = simulatedDeliveryAllowed();
    return {
      configured: simulated,
      provider: 'console',
      simulated
    };
  }

  if (provider !== 'resend') {
    return { configured: false, provider };
  }

  return {
    configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    provider: 'resend'
  };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br>');
}

async function enviarEmail(para, assunto, texto, html = null) {
  if (providerName() === 'console') {
    if (!simulatedDeliveryAllowed()) {
      console.warn('Modo console não está habilitado em produção; email não enviado.');
      return { ok: false, reason: 'provider' };
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email de desenvolvimento] para=${para} assunto=${assunto} conteudo=${texto}`);
    }
    return { ok: true, simulated: true };
  }

  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env;
  if (providerName() !== 'resend') {
    console.warn('Provedor de email inválido ou indisponível.');
    return { ok: false, reason: 'provider' };
  }
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn('Resend não configurado; email não enviado.');
    return { ok: false, reason: 'config' };
  }

  try {
    const response = await axios.post(
      RESEND_EMAIL_URL,
      {
        from: `${process.env.RESEND_FROM_NAME || 'FormulaVest'} <${RESEND_FROM_EMAIL}>`,
        to: [para],
        subject: assunto,
        text: texto,
        html: html || `<p>${escapeHtml(texto)}</p>`
      },
      {
        headers: {
          authorization: `Bearer ${RESEND_API_KEY}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        timeout: EMAIL_TIMEOUT_MS
      }
    );

    return { ok: true, id: response.data?.id };
  } catch (error) {
    console.warn('Erro ao enviar email pelo Resend:', {
      status: error.response?.status,
      message: error.message
    });
    return { ok: false, reason: 'provider' };
  }
}

module.exports = {
  enviarEmail,
  statusEmail
};
