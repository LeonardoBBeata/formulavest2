(() => {
  const STORAGE_KEY = 'lessonProgress';
  const SUBJECTS = {
    portugues: {
      name: 'Português',
      lessons: ['tese-argumentos', 'conectivos-coesao']
    },
    matematica: {
      name: 'Matemática',
      lessons: ['porcentagem', 'funcao-primeiro-grau']
    },
    historia: {
      name: 'História',
      lessons: ['revolucao-industrial', 'abolicao-pos-abolicao']
    },
    geografia: {
      name: 'Geografia',
      lessons: ['escala-cartografica', 'urbanizacao-rede-urbana']
    },
    ingles: {
      name: 'Inglês',
      lessons: ['simple-present', 'false-friends']
    }
  };

  const LESSON_QUIZZES = {
    'tese-argumentos': {
      questions: [
        {
          prompt: 'Qual frase apresenta uma tese sobre a leitura?',
          options: {
            A: 'A biblioteca fica aberta até as seis.',
            B: 'A leitura diária deve ser incentivada porque amplia o repertório dos estudantes.',
            C: 'O livro tem duzentas páginas.',
            D: 'A turma leu um texto na terça-feira.'
          },
          answer: 'B',
          explanation: 'A frase defende uma ideia e apresenta uma razão para sustentá-la.'
        },
        {
          prompt: 'Em um texto argumentativo, qual é a função principal de um dado usado como evidência?',
          options: {
            A: 'Substituir o tema do texto.',
            B: 'Apresentar uma opinião sem relação com a tese.',
            C: 'Apoiar ou justificar a tese.',
            D: 'Encerrar o texto sem conclusão.'
          },
          answer: 'C',
          explanation: 'Dados e exemplos podem dar suporte aos argumentos que defendem a tese.'
        }
      ]
    },
    'conectivos-coesao': {
      questions: [
        {
          prompt: 'Na frase “Estudou bastante, portanto estava preparado”, o conectivo “portanto” indica:',
          options: {
            A: 'Causa.',
            B: 'Oposição.',
            C: 'Conclusão.',
            D: 'Condição.'
          },
          answer: 'C',
          explanation: '“Portanto” introduz uma conclusão decorrente da ideia anterior.'
        },
        {
          prompt: 'Qual conectivo expressa contraste entre duas ideias?',
          options: {
            A: 'Entretanto.',
            B: 'Porque.',
            C: 'Logo.',
            D: 'Assim.'
          },
          answer: 'A',
          explanation: '“Entretanto” apresenta uma oposição ou ressalva.'
        }
      ]
    },
    porcentagem: {
      questions: [
        {
          prompt: 'Quanto é 20% de 150?',
          options: {
            A: '20.',
            B: '25.',
            C: '30.',
            D: '35.'
          },
          answer: 'C',
          explanation: '20% = 0,20; então 0,20 × 150 = 30.'
        },
        {
          prompt: 'Um produto de R$ 80 recebeu 25% de desconto. Qual é o novo preço?',
          options: {
            A: 'R$ 20.',
            B: 'R$ 55.',
            C: 'R$ 60.',
            D: 'R$ 75.'
          },
          answer: 'C',
          explanation: '25% de R$ 80 é R$ 20; subtraindo o desconto, o preço fica R$ 60.'
        }
      ]
    },
    'funcao-primeiro-grau': {
      questions: [
        {
          prompt: 'Qual é a raiz da função f(x) = 2x + 4?',
          options: {
            A: '−4.',
            B: '−2.',
            C: '2.',
            D: '4.'
          },
          answer: 'B',
          explanation: 'Na raiz, f(x) = 0: 2x + 4 = 0, logo x = −2.'
        },
        {
          prompt: 'Se f(x) = 3x − 6, quanto vale f(4)?',
          options: {
            A: '2.',
            B: '6.',
            C: '12.',
            D: '18.'
          },
          answer: 'B',
          explanation: 'Substituindo x por 4: f(4) = 3 × 4 − 6 = 6.'
        }
      ]
    },
    'revolucao-industrial': {
      questions: [
        {
          prompt: 'Onde e quando começou a Revolução Industrial?',
          options: {
            A: 'Na Inglaterra, no século XVIII.',
            B: 'No Brasil, no século XVI.',
            C: 'Na França, no século XV.',
            D: 'Na China, no século XX.'
          },
          answer: 'A',
          explanation: 'A industrialização começou na Inglaterra no século XVIII.'
        },
        {
          prompt: 'Qual transformação está associada à industrialização?',
          options: {
            A: 'Fim imediato das cidades.',
            B: 'Expansão das fábricas e do trabalho assalariado.',
            C: 'Substituição de todas as máquinas por artesanato.',
            D: 'Desaparecimento do comércio.'
          },
          answer: 'B',
          explanation: 'A produção mecanizada concentrou trabalhadores em fábricas e acelerou a urbanização.'
        }
      ]
    },
    'abolicao-pos-abolicao': {
      questions: [
        {
          prompt: 'Em que ano foi assinada a Lei Áurea?',
          options: {
            A: '1822.',
            B: '1850.',
            C: '1888.',
            D: '1930.'
          },
          answer: 'C',
          explanation: 'A Lei Áurea foi assinada em 1888 e aboliu juridicamente a escravidão no Brasil.'
        },
        {
          prompt: 'Qual afirmação descreve melhor o período após a abolição?',
          options: {
            A: 'A lei garantiu imediatamente igualdade econômica para todos.',
            B: 'Não houve mudanças na vida da população negra.',
            C: 'A liberdade legal não foi acompanhada por ampla inclusão social.',
            D: 'A população liberta recebeu terras em todo o país.'
          },
          answer: 'C',
          explanation: 'A abolição não veio acompanhada de políticas amplas de acesso à terra, educação e trabalho.'
        }
      ]
    },
    'escala-cartografica': {
      questions: [
        {
          prompt: 'Em uma escala 1:100.000, 1 cm no mapa representa:',
          options: {
            A: '100 m.',
            B: '1 km.',
            C: '10 km.',
            D: '100 km.'
          },
          answer: 'B',
          explanation: '100.000 cm equivalem a 1.000 m, ou 1 km.'
        },
        {
          prompt: 'Na escala 1:100.000, uma distância de 3 cm no mapa corresponde a:',
          options: {
            A: '300 m.',
            B: '1 km.',
            C: '3 km.',
            D: '30 km.'
          },
          answer: 'C',
          explanation: 'Cada centímetro representa 1 km; portanto, 3 cm representam 3 km.'
        }
      ]
    },
    'urbanizacao-rede-urbana': {
      questions: [
        {
          prompt: 'O que caracteriza a rede urbana?',
          options: {
            A: 'A conexão entre cidades por fluxos de pessoas, mercadorias e informação.',
            B: 'A ausência de relações entre cidades.',
            C: 'A divisão de áreas rurais em propriedades.',
            D: 'A substituição das cidades por áreas naturais.'
          },
          answer: 'A',
          explanation: 'A rede urbana é formada pelas relações e pelos fluxos que conectam diferentes cidades.'
        },
        {
          prompt: 'Qual pode ser uma consequência do crescimento urbano sem planejamento?',
          options: {
            A: 'Desaparecimento de problemas de mobilidade.',
            B: 'Ampliação de desigualdades e dificuldades de acesso a serviços.',
            C: 'Redução automática da população urbana.',
            D: 'Fim da necessidade de infraestrutura.'
          },
          answer: 'B',
          explanation: 'Quando a expansão não é planejada, infraestrutura e serviços podem não acompanhar o crescimento.'
        }
      ]
    },
    'simple-present': {
      questions: [
        {
          prompt: 'Complete: “She ___ to school every day.”',
          options: {
            A: 'go.',
            B: 'goes.',
            C: 'going.',
            D: 'gone.'
          },
          answer: 'B',
          explanation: 'No Simple Present, com “she”, o verbo “go” recebe “-es”: “goes”.'
        },
        {
          prompt: 'Qual pergunta está correta no Simple Present?',
          options: {
            A: 'Does she studies English?',
            B: 'Do she study English?',
            C: 'Does she study English?',
            D: 'She does study English?'
          },
          answer: 'C',
          explanation: 'Com “she”, use “does” e mantenha o verbo principal na forma base: “study”.'
        }
      ]
    },
    'false-friends': {
      questions: [
        {
          prompt: 'O que “actually” significa em inglês?',
          options: {
            A: 'Atualmente.',
            B: 'Na verdade.',
            C: 'Atualmente mesmo.',
            D: 'Aproximadamente.'
          },
          answer: 'B',
          explanation: '“Actually” significa “na verdade” ou “de fato”.'
        },
        {
          prompt: 'A palavra “parents” significa:',
          options: {
            A: 'Parentes.',
            B: 'Parceiros.',
            C: 'Pais.',
            D: 'Professores.'
          },
          answer: 'C',
          explanation: '“Parents” significa “pais”; “relatives” é que significa “parentes”.'
        }
      ]
    }
  };

  function gradeAnswers(lessonId, answers = {}) {
    const quiz = LESSON_QUIZZES[lessonId];
    if (!quiz) throw new RangeError(`Lição desconhecida: ${lessonId}`);

    const results = quiz.questions.map((question, index) => {
      const selected = String(answers[index] || '').trim().toUpperCase();
      return {
        selected,
        correct: question.answer,
        answered: Object.prototype.hasOwnProperty.call(question.options, selected),
        isCorrect: selected === question.answer,
        explanation: question.explanation
      };
    });

    return {
      allAnswered: results.every(result => result.answered),
      score: results.filter(result => result.isCorrect).length,
      total: results.length,
      answers: results
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readProgress() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (error) {
      console.warn('O progresso das lições está inválido; iniciando sem progresso salvo.', error);
      return {};
    }
  }

  function saveProgress(progress) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      window.StudyProgress.scheduleSave();
      return true;
    } catch (error) {
      console.error('Não foi possível salvar o progresso das lições.', error);
      return false;
    }
  }

  function atualizarProgresso() {
    const progress = readProgress();
    Object.entries(SUBJECTS).forEach(([subjectId, subject]) => {
      const concluidas = subject.lessons.filter(id => progress[id]?.completedAt).length;
      const label = document.querySelector(`[data-subject-progress="${subjectId}"]`);
      if (label) label.textContent = `${concluidas}/${subject.lessons.length} lições concluídas`;

      subject.lessons.forEach(lessonId => {
        const detail = document.querySelector(`[data-lesson-id="${lessonId}"]`);
        const summary = detail?.querySelector('summary');
        if (!summary) return;

        let badge = summary.querySelector('.lesson-completion');
        if (progress[lessonId]?.completedAt) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'lesson-completion';
            summary.appendChild(badge);
          }
          badge.textContent = `Concluída · ${progress[lessonId].score}/${progress[lessonId].total}`;
        } else {
          badge?.remove();
        }
      });
    });
  }

  function renderQuiz(detail, lessonId) {
    const quiz = LESSON_QUIZZES[lessonId];
    const body = detail.querySelector('.lesson-body');
    if (!body || !quiz) return;

    const form = document.createElement('form');
    form.className = 'lesson-quiz';
    form.dataset.lessonQuiz = lessonId;
    form.innerHTML = `
      <h4>Agora é sua vez</h4>
      <p class="lesson-quiz-intro">Responda às questões para concluir esta lição.</p>
      ${quiz.questions.map((question, index) => `
        <fieldset class="lesson-question">
          <legend>${index + 1}. ${escapeHtml(question.prompt)}</legend>
          ${Object.entries(question.options).map(([letter, text]) => `
            <label class="lesson-option">
              <input type="radio" name="question-${index}" value="${letter}" required>
              <span><strong>${letter})</strong> ${escapeHtml(text)}</span>
            </label>
          `).join('')}
        </fieldset>
      `).join('')}
      <div class="lesson-quiz-actions">
        <button type="submit">Conferir respostas</button>
        <button class="ghost-btn" type="button" data-lesson-retry hidden>Refazer lição</button>
      </div>
      <p class="lesson-quiz-status" role="status" aria-live="polite"></p>
      <div class="lesson-quiz-results" aria-live="polite"></div>
    `;
    body.insertAdjacentElement('afterend', form);

    form.addEventListener('submit', event => {
      event.preventDefault();
      const selected = Object.fromEntries(new FormData(form).entries());
      const result = gradeAnswers(lessonId, Object.fromEntries(
        quiz.questions.map((question, index) => [index, selected[`question-${index}`] || ''])
      ));

      if (!result.allAnswered) {
        form.querySelector('.lesson-quiz-status').textContent = 'Responda a todas as questões antes de conferir.';
        return;
      }

      const results = form.querySelector('.lesson-quiz-results');
      results.innerHTML = `
        <h4>Você acertou ${result.score} de ${result.total}</h4>
        ${result.answers.map((answer, index) => `
          <div class="lesson-answer ${answer.isCorrect ? 'is-correct' : 'is-incorrect'}">
            <strong>Questão ${index + 1}: ${answer.isCorrect ? 'correta!' : `resposta correta ${answer.correct}.`}</strong>
            <p>${escapeHtml(answer.explanation)}</p>
          </div>
        `).join('')}
      `;
      result.answers.forEach((answer, index) => {
        const fieldset = form.querySelectorAll('.lesson-question')[index];
        const selectedOption = fieldset.querySelector('input:checked')?.closest('.lesson-option');
        selectedOption?.classList.add(answer.isCorrect ? 'is-correct' : 'is-incorrect');
        if (!answer.isCorrect) {
          fieldset.querySelector(`input[value="${answer.correct}"]`)?.closest('.lesson-option')?.classList.add('is-correct');
        }
      });

      const progress = readProgress();
      const previous = progress[lessonId];
      const previousScore = Number(previous?.score);
      const score = Number.isFinite(previousScore) ? Math.max(previousScore, result.score) : result.score;
      progress[lessonId] = {
        score,
        total: result.total,
        completedAt: new Date().toISOString()
      };
      const saved = saveProgress(progress);
      atualizarProgresso();

      form.querySelector('.lesson-quiz-status').textContent = saved
        ? `Lição concluída! Seu resultado foi salvo: ${result.score}/${result.total}.`
        : `Lição concluída: ${result.score}/${result.total}. Não foi possível salvar o progresso neste navegador.`;
      form.querySelectorAll('input[type="radio"]').forEach(input => { input.disabled = true; });
      form.querySelector('button[type="submit"]').hidden = true;
      form.querySelector('[data-lesson-retry]').hidden = false;
    });

    form.querySelector('[data-lesson-retry]').addEventListener('click', () => {
      form.reset();
      form.querySelectorAll('input[type="radio"]').forEach(input => { input.disabled = false; });
      form.querySelectorAll('.lesson-option').forEach(option => {
        option.classList.remove('is-correct', 'is-incorrect', 'is-selected');
      });
      form.querySelector('.lesson-quiz-status').textContent = '';
      form.querySelector('.lesson-quiz-results').innerHTML = '';
      form.querySelector('button[type="submit"]').hidden = false;
      form.querySelector('[data-lesson-retry]').hidden = true;
    });

    form.addEventListener('change', event => {
      const option = event.target.closest('.lesson-option');
      if (!option) return;
      option.closest('.lesson-question').querySelectorAll('.lesson-option').forEach(label => {
        label.classList.toggle('is-selected', label === option);
      });
    });
  }

  async function inicializarLicoes() {
    await window.StudyProgress.load();
    const section = document.getElementById('licoes');
    if (!section) return;

    section.querySelectorAll('.lesson-filter-button').forEach(button => {
      button.addEventListener('click', () => {
        const subjectId = button.dataset.lessonSubject;
        section.querySelectorAll('.lesson-filter-button').forEach(filter => {
          const active = filter === button;
          filter.classList.toggle('is-active', active);
          filter.setAttribute('aria-pressed', String(active));
        });
        section.querySelectorAll('.lesson-subject').forEach(subject => {
          subject.hidden = subjectId !== 'all' && subject.dataset.lessonSubject !== subjectId;
        });
      });
    });

    section.querySelectorAll('.lesson-item[data-lesson-id]').forEach(detail => {
      renderQuiz(detail, detail.dataset.lessonId);
    });

    atualizarProgresso();
  }

  const api = {
    subjectIds: Object.keys(SUBJECTS),
    lessonIds: Object.keys(LESSON_QUIZZES),
    gradeAnswers
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.LessonQuizzes = api;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inicializarLicoes, { once: true });
    } else {
      inicializarLicoes();
    }
  }
})();
