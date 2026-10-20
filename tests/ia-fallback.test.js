const { chamarIA, extrairJSONSeguro } = require('../services/ia');

describe('Fallback da IA sem chave externa', () => {
  test('deve retornar fallback local quando a API externa nao estiver configurada', async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const resposta = await chamarIA('Crie 1 questão de matemática');
      const json = extrairJSONSeguro(resposta);

      expect(typeof resposta).toBe('string');
      expect(json).not.toBeNull();
      expect(Array.isArray(json.questoes)).toBe(true);
      expect(json.questoes.length).toBeGreaterThan(0);
    } finally {
      if (original === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = original;
      }
    }
  });
});
