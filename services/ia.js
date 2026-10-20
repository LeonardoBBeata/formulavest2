const axios = require('axios');

const MODELOS_FALLBACK = [
  'openrouter/free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.1-8b-instruct:free'
];

function isPaidModel(modelo = '') {
  return /gpt-4|gpt-4o|gpt-4.1|gpt-4o-mini|claude|sonnet|haiku|o1|o3|gemini-2\.|deepseek-r1|reasoning/i.test(String(modelo || ''));
}

function obterModelos() {
  const configured = String(process.env.OPENROUTER_MODEL || '').trim();
  const modelos = [];

  if (configured && !isPaidModel(configured) && configured !== 'openrouter/free' && configured !== 'openai/gpt-oss-20b:free') {
    modelos.push(configured);
  }

  MODELOS_FALLBACK.forEach(modelo => {
    if (!modelos.includes(modelo)) modelos.push(modelo);
  });

  return modelos.filter(Boolean);
}

function obterModelo() {
  return obterModelos()[0];
}

function extrairTextoDaResposta(data) {
  const mensagem = data?.choices?.[0]?.message;
  const content = mensagem?.content;

  if (typeof content === 'string' && content.trim()) return content.trim();

  if (Array.isArray(content)) {
    const textos = content
      .map(item => typeof item === 'string' ? item : item?.text || item?.content || '')
      .filter(Boolean);
    const joined = textos.join('\n').trim();
    if (joined) return joined;
  }

  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return '';
}

function normalizarTema(valor = '') {
  return String(valor || '')
    .replace(/^[\s\"'`:#]+|[\s\"'`:#]+$/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[:;,.]+$/, '')
    .trim();
}

function extrairQuantidadePrompt(prompt = '') {
  const match = String(prompt).match(/crie\s+(\d+)\s+quest/i) || String(prompt).match(/(\d+)\s+quest/i);
  const numero = Number(match?.[1] || 10);
  return Number.isFinite(numero) && numero > 0 ? numero : 10;
}

function extrairTemaPrompt(prompt = '') {
  const promptSemCase = String(prompt).toLowerCase();

  const materiaMatch = String(prompt).match(/\bmat[eé]ria\s*[:\-]?\s*([^\n.]+)/i)
    || String(prompt).match(/\bsobre\s+(?:a\s+)?mat[eé]ria\s+([^\n.]+)/i)
    || String(prompt).match(/\btema\s*[:\-]?\s*([^\n.]+)/i)
    || String(prompt).match(/\bassunto\s*[:\-]?\s*([^\n.]+)/i)
    || String(prompt).match(/\bquest(?:ão|ões|ao|oes?)\s+(?:de|sobre)\s+([^\n.]+)/i);

  if (materiaMatch?.[1]) {
    const tema = normalizarTema(materiaMatch[1]);
    if (tema) return tema;
  }

  const cursoMatch = String(prompt).match(/\bcurso\s*[:\-]?\s*([^\n.]+)/i);
  if (cursoMatch?.[1]) return normalizarTema(cursoMatch[1]);

  if (promptSemCase.includes('matemat')) return 'Matemática';
  if (promptSemCase.includes('humanas') || promptSemCase.includes('historia') || promptSemCase.includes('geografia')) return 'Ciências Humanas';
  if (promptSemCase.includes('natureza') || promptSemCase.includes('biologia') || promptSemCase.includes('quimica') || promptSemCase.includes('fisica')) return 'Ciências da Natureza';
  if (promptSemCase.includes('linguagens') || promptSemCase.includes('portugu')) return 'Linguagens e Códigos';

  return 'Conhecimentos Gerais';
}

function gerarPerguntaFallback(tema, indice) {
  const temaSanitizado = normalizarTema(tema) || 'Conhecimentos Gerais';
  const numero = Number(indice) + 1;

  if (temaSanitizado.toLowerCase().includes('matem')) {
    const valorA = 12 + indice * 3;
    const valorB = 8 + indice * 2;
    const custo = valorA * valorB;
    return {
      enunciado: `Questão ${numero}: Uma loja vende ${valorA} camisetas por caixa e cada caixa custa R$ ${valorB}. Se a loja vendeu ${valorA + 2} caixas em um dia, qual foi o valor total arrecadado?`,
      opcoes: {
        A: `R$ ${(valorA + 2) * valorB * 2}`,
        B: `R$ ${custo}`,
        C: `R$ ${(valorA + 2) * valorB}`,
        D: `R$ ${(valorA + 2) * valorB + 10}`,
        E: `R$ ${(valorA + 2) * valorB - 5}`
      },
      correta: 'C'
    };
  }

  if (temaSanitizado.toLowerCase().includes('humanas') || temaSanitizado.toLowerCase().includes('historia') || temaSanitizado.toLowerCase().includes('geografia')) {
    return {
      enunciado: `Questão ${numero}: A expansão territorial de um Estado moderno costuma estar relacionada a fatores econômicos, políticos e estratégicos. Qual fator mais diretamente contribui para a consolidação do poder de um território?`,
      opcoes: {
        A: 'A presença de uma grande população urbana sem infraestrutura.',
        B: 'O controle de rotas comerciais e pontos estratégicos.',
        C: 'A inexistência de conflitos externos.',
        D: 'A eliminação de todas as formas de trabalho manual.',
        E: 'A troca de idioma oficial em todas as capitais.'
      },
      correta: 'B'
    };
  }

  if (temaSanitizado.toLowerCase().includes('natureza') || temaSanitizado.toLowerCase().includes('biologia') || temaSanitizado.toLowerCase().includes('quimica') || temaSanitizado.toLowerCase().includes('fisica')) {
    return {
      enunciado: `Questão ${numero}: Em um experimento, a temperatura de um líquido aumenta ao receber calor. Esse fenômeno está relacionado principalmente à variação de sua energia:`,
      opcoes: {
        A: 'Cinética média das partículas.',
        B: 'Massa total do sistema.',
        C: 'Volume do recipiente em que está contido.',
        D: 'Número de elétrons do átomo principal.',
        E: 'Densidade do ar ambiente.'
      },
      correta: 'A'
    };
  }

  if (temaSanitizado.toLowerCase().includes('linguagens') || temaSanitizado.toLowerCase().includes('portugu')) {
    return {
      enunciado: `Questão ${numero}: Na frase “O aluno respondeu com atenção ao professor”, a expressão destacada funciona como complemento que indica:`,
      opcoes: {
        A: 'Tempo verbal da oração.',
        B: 'Modo de ação do sujeito.',
        C: 'Objeto indireto da ação.',
        D: 'Circunstância de modo.',
        E: 'Predicado nominal.'
      },
      correta: 'D'
    };
  }

  return {
    enunciado: `Questão ${numero}: Em um contexto de estudo e trabalho, a organização adequada do tempo é essencial para a produtividade. Qual estratégia é mais eficaz para melhorar o desempenho pessoal?`,
    opcoes: {
      A: 'Priorizar tarefas importantes e estabelecer metas claras.',
      B: 'Aumentar a quantidade de tarefas sem planejamento.',
      C: 'Ignorar pausas e descanso para manter foco constante.',
      D: 'Concentrar-se apenas em tarefas fáceis e rápidas.',
      E: 'Cancelar todas as prioridades para reduzir a carga.'
    },
    correta: 'A'
  };
}

function gerarRespostaFallback(prompt = '') {
  const contextoPrompt = String(prompt).match(/com base neste prompt:\s*["“]([^"\n]+)["”]/i)?.[1];
  const tema = extrairTemaPrompt(contextoPrompt || prompt);
  const pedeQuestaoUnica = /uma\s+unica\s+quest[aã]o/i.test(prompt) && /"questao"\s*:/i.test(prompt);

  if (pedeQuestaoUnica) {
    const base = gerarPerguntaFallback(tema, 0);
    const opcoes = Object.fromEntries(
      Object.entries(base.opcoes).filter(([letra]) => ['A', 'B', 'C', 'D'].includes(letra))
    );

    return JSON.stringify({
      questao: {
        ...base,
        materia: normalizarTema(tema) || 'Conhecimentos Gerais',
        assunto: normalizarTema(tema) || 'Conhecimentos Gerais',
        dificuldade: 'medio',
        explicacao: 'A alternativa correta é a que responde ao enunciado com base no conteúdo estudado.',
        opcoes
      }
    });
  }

  const quantidade = extrairQuantidadePrompt(prompt);

  const questoes = Array.from({ length: quantidade }, (_, index) => {
    const base = gerarPerguntaFallback(tema, index);
    return {
      ...base,
      materia: normalizarTema(tema) || 'Conhecimentos Gerais'
    };
  });

  return JSON.stringify({ questoes });
}

async function chamarIA(prompt, modelos = obterModelos()) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey) {
    console.warn('OPENROUTER_API_KEY ausente. Usando fallback local para manter a geração funcionando sem modelo pago.');
    return gerarRespostaFallback(typeof prompt === 'string' ? prompt : '');
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    console.warn('Prompt de IA vazio. Usando fallback local para manter o fluxo estável.');
    return gerarRespostaFallback('');
  }

  if (prompt.length > 40000) {
    console.warn('Prompt de IA excedeu o limite. Usando fallback local em vez de interromper a geração.');
    return gerarRespostaFallback(prompt);
  }

  let ultimoErro = null;

  for (const model of modelos) {
    try {
      console.log('Enviando para OpenRouter com modelo:', model);

      const response = await axios.post(
        process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            {
              role: 'system',
              content: 'Voce e especialista em vestibulares brasileiros e deve responder SOMENTE em JSON valido.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
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

      const texto = extrairTextoDaResposta(response.data);
      if (!texto) {
        throw new Error('IA retornou vazio');
      }

      console.log('Resposta recebida da IA.');
      return texto;
    } catch (err) {
      ultimoErro = err;
      const providerMessage = err.response?.data?.error?.message || '';
      console.error('ERRO IA:', { model, status: err.response?.status, data: err.response?.data || err.message });

      if (/model.*(not found|not available)|unavailable for free|requires credits|payment|not supported/i.test(providerMessage)) {
        continue;
      }

      if (String(err.message).includes('IA retornou vazio')) {
        continue;
      }
    }
  }

  if (ultimoErro?.response?.status === 404 && /unavailable for free/i.test(ultimoErro.response?.data?.error?.message || '')) {
    console.warn('OpenRouter indisponível para o modelo selecionado. Usando fallback local para manter a prova funcionando.');
    return gerarRespostaFallback(prompt);
  }

  console.warn('OpenRouter indisponível ou sem créditos. Usando fallback local para continuar a geração da prova.');
  return gerarRespostaFallback(prompt);
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
  extrairJSONSeguro,
  obterModelo,
  obterModelos,
  gerarRespostaFallback,
  extrairQuantidadePrompt,
  extrairTemaPrompt
};
