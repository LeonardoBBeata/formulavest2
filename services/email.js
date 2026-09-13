const nodemailer = require('nodemailer');

function criarTransportadorOutlook() {
  return nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.OUTLOOK_EMAIL,
      pass: process.env.OUTLOOK_APP_PASSWORD
    }
  });
}

async function enviarEmail(para, assunto, texto, html = null) {
  if (!process.env.OUTLOOK_EMAIL || !process.env.OUTLOOK_APP_PASSWORD) {
    console.warn('OUTLOOK_EMAIL ou OUTLOOK_APP_PASSWORD ausente; email nao enviado.');
    return { ok: false, reason: 'config' };
  }

  try {
    const info = await criarTransportadorOutlook().sendMail({
      from: `FormulaVest <${process.env.OUTLOOK_EMAIL}>`,
      to: [para],
      subject: assunto,
      text: texto,
      html: html || `<p>${texto}</p>`
    });

    return { ok: true, id: info.messageId };
  } catch (error) {
    console.warn('Erro ao enviar email pelo Outlook:', error?.message || error);
    return { ok: false, reason: 'provider' };
  }
}

module.exports = {
  enviarEmail
};
