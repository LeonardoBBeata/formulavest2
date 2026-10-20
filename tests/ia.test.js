const axios = require('axios');

jest.mock('axios');

const { chamarIA, obterModelos, gerarRespostaFallback } = require('../services/ia');

describe('OpenRouter fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'teste-key';
    process.env.OPENROUTER_MODEL = 'openrouter/free';
  });

  test('deve tentar um modelo válido quando o padrão configurado falha', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('IA retornou vazio'))
      .mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: '{"ok": true}' } }]
        }
      });

    const response = await chamarIA('teste de prompt');

    expect(response).toBe('{"ok": true}');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][1].model).toBe('openrouter/free');
  });

  test('deve manter um conjunto de modelos válidos como fallback', () => {
    const modelos = obterModelos();
    expect(modelos[0]).toBe('openrouter/free');
    expect(modelos).toContain('openai/gpt-oss-20b:free');
    expect(modelos.every(modelo => !/gpt-4|claude|sonnet|haiku|gemini-2\.|deepseek-r1|reasoning/i.test(modelo))).toBe(true);
  });

  test('deve devolver fallback local quando a IA falha por falta de créditos', async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 402,
        data: {
          error: {
            message: 'Insufficient credits. This account never purchased credits.'
          }
        }
      }
    });

    const response = await chamarIA('Crie 3 questoes sobre matematica');
    const parsed = JSON.parse(response);

    expect(parsed.questoes).toHaveLength(3);
    expect(parsed.questoes[0]).toHaveProperty('opcoes');
    expect(parsed.questoes[0].correta).toMatch(/[A-E]/);
  });

  test('deve gerar fallback com tema limpo e alternativas distintas', () => {
    const response = gerarRespostaFallback('Crie 3 questões de Matemática');
    const parsed = JSON.parse(response);

    expect(parsed.questoes).toHaveLength(3);
    expect(parsed.questoes[0].enunciado).not.toMatch(/[:"]{2,}|\"\"/);
    expect(Object.keys(parsed.questoes[0].opcoes)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(new Set(Object.values(parsed.questoes[0].opcoes)).size).toBe(5);
  });

  test('deve respeitar o contrato da geração de questão única sem modelo externo', () => {
    const prompt = `
Crie UMA unica questão de múltipla escolha estilo ENEM com base neste prompt:
"questão de matemática sobre porcentagem"
RETORNE SOMENTE JSON VALIDO:
{
  "questao": {
    "enunciado": "",
    "opcoes": { "A": "", "B": "", "C": "", "D": "" },
    "correta": "A"
  }
}
`;
    const parsed = JSON.parse(gerarRespostaFallback(prompt));

    expect(parsed.questao).toBeDefined();
    expect(parsed.questao.materia).toMatch(/Matemática/i);
    expect(Object.keys(parsed.questao.opcoes)).toEqual(['A', 'B', 'C', 'D']);
    expect(parsed.questao.opcoes[parsed.questao.correta]).toBeTruthy();
    expect(parsed.questoes).toBeUndefined();
  });
});
