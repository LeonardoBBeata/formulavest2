const axios = require('axios');

async function chamarIA(prompt) {
  try {
    console.log('Enviando para OpenRouter...');

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free',
        messages: [
          {
            role: 'system',
            content:
              'Voce e especialista em vestibulares brasileiros e deve responder SOMENTE em JSON valido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://formulavest.onrender.com',
          'X-Title': 'FormulaVest'
        },
        timeout: 120000
      }
    );

    const texto = response.data?.choices?.[0]?.message?.content;

    if (!texto) {
      throw new Error('IA retornou vazio');
    }

    console.log('Resposta recebida da IA.');
    return texto;
  } catch (err) {
    console.error('ERRO IA:', err.response?.data || err.message);
    throw new Error('Erro IA');
  }
}

function extrairJSONSeguro(texto) {
  try {
    const match = texto.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (err) {
    console.error('Erro ao extrair JSON:', err);
    return null;
  }
}

module.exports = {
  chamarIA,
  extrairJSONSeguro
};
