const { buildEnemQuestionPlan, createBatchesOfTen } = require('../utils/examState');

const TOTAL_QUESTIONS = 90;
const BATCH_CONCURRENCY = 2;
const MAX_BATCH_ATTEMPTS = 3;

function retryDelay(error, attempt) {
  const retryAfter = Number(error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(30000, retryAfter * 1000);
  }
  return attempt * 2000;
}

function buildBatchPrompt(type, batch, subjectLabels = {}) {
  if (type === 'provao') {
    return `
Crie ${batch.size} questões inéditas estilo Provão Paulista.
As questões devem ser variadas e consistentes com o nível do ensino médio.

RETORNE SOMENTE JSON:
{
  "questoes":[
    {
      "enunciado":"",
      "materia":"",
      "opcoes":{"A":"","B":"","C":"","D":"","E":""},
      "correta":"A"
    }
  ]
}
`;
  }

  const subjectSummary = Object.entries(batch.subjectCounts)
    .map(([subject, count]) => `${subject}: ${count}`)
    .join('; ');
  return `
Crie um lote de ${batch.size} questões inéditas estilo ENEM.
Distribuição exata deste bloco: ${subjectSummary}

Importante: o resultado final da prova deve chegar a ${TOTAL_QUESTIONS} questões e manter a divisão real do ENEM por área.

RETORNE SOMENTE JSON:
{
  "questoes":[
    {
      "enunciado":"",
      "materia":"",
      "opcoes":{"A":"","B":"","C":"","D":"","E":""},
      "correta":"A"
    }
  ]
}
`;
}

function assignEnemSubjects(questions, batch, labels) {
  const subjectOrder = [];
  Object.entries(batch.subjectCounts).forEach(([subject, count]) => {
    for (let index = 0; index < count; index += 1) subjectOrder.push(subject);
  });

  return questions.map((question, index) => {
    const subject = subjectOrder[index] || 'linguagens';
    return {
      ...question,
      materia: String(question.materia || labels[subject] || 'Linguagens e Códigos').trim()
        || labels[subject]
        || 'Linguagens e Códigos'
    };
  });
}

async function generateExamQuestions({
  type,
  chamarIA,
  extrairJSONSeguro,
  validarQuestao,
  onProgress = async () => {}
}) {
  if (!['enem', 'provao'].includes(type)) throw new RangeError(`Tipo de prova inválido: ${type}`);

  const batches = type === 'enem'
    ? buildEnemQuestionPlan(TOTAL_QUESTIONS, 10).batches
    : createBatchesOfTen(TOTAL_QUESTIONS, 10);
  const subjectLabels = {
    linguagens: 'Linguagens e Códigos',
    humanas: 'Ciências Humanas',
    natureza: 'Ciências da Natureza',
    matematica: 'Matemática'
  };
  const generated = [];

  for (let offset = 0; offset < batches.length; offset += BATCH_CONCURRENCY) {
    const currentBatches = batches.slice(offset, offset + BATCH_CONCURRENCY);
    const results = await Promise.all(currentBatches.map(async batch => {
      const prompt = buildBatchPrompt(type, batch, subjectLabels);
      let lastError;

      for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
        try {
          const response = await chamarIA(prompt, undefined, {
            timeoutMs: 10000,
            maxTokens: 6000,
            allowFallback: false
          });
          const json = extrairJSONSeguro(response);
          const questions = Array.isArray(json?.questoes) ? json.questoes.slice(0, batch.size) : [];
          if (questions.length !== batch.size || questions.some(question => !validarQuestao(question))) {
            throw new Error('Lote de questões incompleto ou inválido');
          }
          return type === 'enem' ? assignEnemSubjects(questions, batch, subjectLabels) : questions;
        } catch (error) {
          lastError = error;
          if (attempt < MAX_BATCH_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, retryDelay(error, attempt)));
          }
        }
      }

      throw lastError || new Error('Não foi possível gerar um lote de questões');
    }));

    generated.push(...results.flat());
    await onProgress(Math.min(TOTAL_QUESTIONS, generated.length));
  }

  if (generated.length !== TOTAL_QUESTIONS) {
    throw new Error(`Esperadas ${TOTAL_QUESTIONS} questões; recebidas ${generated.length}`);
  }

  return generated;
}

module.exports = {
  BATCH_CONCURRENCY,
  MAX_BATCH_ATTEMPTS,
  TOTAL_QUESTIONS,
  generateExamQuestions
};
