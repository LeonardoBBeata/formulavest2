const { gerarRespostaFallback, extrairJSONSeguro } = require('./services/ia');

const texto = gerarRespostaFallback('Crie 3 questoes sobre matematica');
const json = extrairJSONSeguro(texto);
console.log(JSON.stringify({
  ok: !!json,
  total: json && Array.isArray(json.questoes) ? json.questoes.length : 0,
  correta: json && json.questoes && json.questoes[0] ? json.questoes[0].correta : null
}, null, 2));
