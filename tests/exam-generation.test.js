const { generateExamQuestions } = require('../services/examGeneration');

function makeQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    enunciado: `Questão válida ${index + 1}`,
    materia: 'Geral',
    opcoes: { A: 'Alternativa A', B: 'Alternativa B', C: 'Alternativa C', D: 'Alternativa D', E: 'Alternativa E' },
    correta: 'A'
  }));
}

function parseJson(value) {
  return JSON.parse(value);
}

function isValid(question) {
  return Boolean(question?.enunciado && question?.opcoes?.A && question?.opcoes?.E && question?.correta === 'A');
}

describe('geração resiliente de provas', () => {
  test('gera 90 questões com no máximo dois lotes simultâneos', async () => {
    let active = 0;
    let maximumActive = 0;
    const chamarIA = jest.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return JSON.stringify({ questoes: makeQuestions(10) });
    });
    const progress = [];

    const questions = await generateExamQuestions({
      type: 'enem',
      chamarIA,
      extrairJSONSeguro: parseJson,
      validarQuestao: isValid,
      onProgress: async value => progress.push(value)
    });

    expect(questions).toHaveLength(90);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(progress).toEqual([20, 40, 60, 80, 90]);
    expect(chamarIA.mock.calls[0][2]).toMatchObject({
      timeoutMs: 10000,
      maxTokens: 6000,
      allowFallback: false
    });
  });

  test('refaz um lote incompleto em vez de aceitar uma prova menor', async () => {
    let calls = 0;
    const chamarIA = jest.fn(async () => {
      calls += 1;
      return JSON.stringify({ questoes: makeQuestions(calls === 1 ? 9 : 10) });
    });

    const questions = await generateExamQuestions({
      type: 'provao',
      chamarIA,
      extrairJSONSeguro: parseJson,
      validarQuestao: isValid
    });

    expect(questions).toHaveLength(90);
    expect(calls).toBe(10);
  });
});
