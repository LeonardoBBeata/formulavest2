function gerarCodigoProva() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function removerGabarito(questoes) {
  return questoes.map(({ correta, ...questao }, index) => ({
    id: index,
    ...questao
  }));
}

function normalizarQuestaoProfessor(questao) {
  return {
    enunciado: String(questao.enunciado || '').trim(),
    opcoes: questao.opcoes || {},
    correta: String(questao.correta || '').trim().toUpperCase(),
    materia: questao.materia || null
  };
}

module.exports = {
  gerarCodigoProva,
  removerGabarito,
  normalizarQuestaoProfessor
};
