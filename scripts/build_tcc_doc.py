from pathlib import Path
from datetime import date

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Formulavest_Documentacao_TCC.docx"

BLUE = RGBColor(46, 116, 181)
DARK_BLUE = RGBColor(31, 77, 120)
INK = RGBColor(15, 23, 42)
MUTED = RGBColor(100, 116, 139)
LIGHT_FILL = "F2F4F7"
MID_FILL = "E8EEF5"
BORDER = "D7DBE2"


def set_run_font(run, name="Calibri", size=None, color=None, bold=None, italic=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_width(cell, dxa):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.find(qn("w:tcMar"))
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=BORDER):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "6")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_table_width(table, widths):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths)))
    tbl_w.set(qn("w:type"), "dxa")

    tbl_grid = tbl.tblGrid
    if tbl_grid is None:
        tbl_grid = OxmlElement("w:tblGrid")
        tbl.append(tbl_grid)
    for child in list(tbl_grid):
        tbl_grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        tbl_grid.append(col)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            set_cell_width(cell, widths[idx])
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def table(rows, widths, header=True):
    doc = table.doc
    tbl = doc.add_table(rows=len(rows), cols=len(widths))
    set_table_width(tbl, widths)
    set_table_borders(tbl)
    for r_idx, row in enumerate(rows):
        for c_idx, text in enumerate(row):
            cell = tbl.rows[r_idx].cells[c_idx]
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(str(text))
            set_run_font(run, size=9.5 if r_idx else 10, color=INK, bold=(header and r_idx == 0))
            if header and r_idx == 0:
                set_cell_shading(cell, LIGHT_FILL)
    doc.add_paragraph()
    return tbl


def add_para(doc, text="", style=None, bold=False, italic=False, color=INK, size=11, align=None, after=6):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.1
    if align is not None:
        p.alignment = align
    run = p.add_run(text)
    set_run_font(run, size=size, color=color, bold=bold, italic=italic)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.167
        run = p.add_run(item)
        set_run_font(run, size=11, color=INK)


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.167
        run = p.add_run(item)
        set_run_font(run, size=11, color=INK)


def heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.space_before = Pt(16 if level == 1 else 12 if level == 2 else 8)
    p.paragraph_format.space_after = Pt(8 if level == 1 else 6 if level == 2 else 4)
    for run in p.runs:
        set_run_font(
            run,
            size=16 if level == 1 else 13 if level == 2 else 12,
            color=BLUE if level in (1, 2) else DARK_BLUE,
            bold=True,
        )
    return p


def page_break(doc):
    doc.add_page_break()


def configure_document(doc):
    sec = doc.sections[0]
    sec.page_width = Inches(8.5)
    sec.page_height = Inches(11)
    sec.top_margin = Inches(1)
    sec.bottom_margin = Inches(1)
    sec.left_margin = Inches(1)
    sec.right_margin = Inches(1)
    sec.header_distance = Inches(0.492)
    sec.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    for name, size, color in (
        ("Heading 1", 16, BLUE),
        ("Heading 2", 13, BLUE),
        ("Heading 3", 12, DARK_BLUE),
    ):
        st = styles[name]
        st.font.name = "Calibri"
        st._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        st._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        st.font.size = Pt(size)
        st.font.color.rgb = color
        st.font.bold = True

    header = sec.header.paragraphs[0]
    header.text = ""
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run("FormulaVest - Documentacao Tecnica")
    set_run_font(run, size=9, color=MUTED)

    footer = sec.footer.paragraphs[0]
    footer.text = ""
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("Projeto academico e tecnico - FormulaVest")
    set_run_font(run, size=9, color=MUTED)


def cover(doc):
    add_para(doc, "FORMULAVEST", bold=True, size=14, color=INK, align=WD_ALIGN_PARAGRAPH.CENTER, after=18)
    add_para(
        doc,
        "DOCUMENTACAO COMPLETA DO PROJETO",
        bold=True,
        size=22,
        color=BLUE,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=8,
    )
    add_para(
        doc,
        "Plataforma Web de Estudos, Simulados, Provas ao Vivo e Gestao Escolar",
        size=14,
        color=DARK_BLUE,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=28,
    )
    rows = [
        ("Tipo de documento", "Relatorio tecnico em formato de TCC"),
        ("Sistema", "FormulaVest"),
        ("Stack principal", "Node.js, Express, PostgreSQL, HTML, CSS e JavaScript"),
        ("Versao documentada", date.today().strftime("%d/%m/%Y")),
        ("Escopo", "Arquitetura, requisitos, banco de dados, funcionalidades, testes, implantacao e manutencao"),
    ]
    table(rows, [2600, 6760], header=False)
    add_para(
        doc,
        "Documento elaborado para registrar a estrutura tecnica, a proposta pedagogica e os fluxos operacionais do sistema FormulaVest.",
        italic=True,
        color=MUTED,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=18,
    )
    add_para(doc, "Brasil, 2026", size=11, align=WD_ALIGN_PARAGRAPH.CENTER, after=0)
    page_break(doc)


def add_callout(doc, title, body):
    tbl = doc.add_table(rows=1, cols=1)
    set_table_width(tbl, [9360])
    set_table_borders(tbl, color="B7C7DA")
    cell = tbl.rows[0].cells[0]
    set_cell_shading(cell, "F4F6F9")
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(title)
    set_run_font(r, size=11, bold=True, color=DARK_BLUE)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    r2 = p2.add_run(body)
    set_run_font(r2, size=10.5, color=INK)
    doc.add_paragraph()


def build_doc():
    doc = Document()
    configure_document(doc)
    table.doc = doc
    cover(doc)

    heading(doc, "Resumo", 1)
    add_para(
        doc,
        "O FormulaVest e uma plataforma web voltada ao apoio de estudos, simulados e gestao de atividades avaliativas. "
        "O sistema integra area do aluno, painel do professor, painel administrativo, provas geradas por inteligencia artificial, "
        "provas ao vivo com codigo de acesso, ranking, conquistas, redacao, relatorios e administracao de empresas, escolas, periodos e salas.",
    )
    add_para(
        doc,
        "A documentacao descreve os objetivos do projeto, sua arquitetura, modelo de dados, fluxos de usuario, requisitos funcionais e nao funcionais, "
        "estrategias de seguranca, rotas principais, procedimentos de implantacao e pontos de manutencao. Tambem registra correcoes recentes realizadas "
        "para estabilizar a geracao de provas e a prova ao vivo.",
    )
    heading(doc, "Palavras-chave", 2)
    add_para(doc, "Educacao; simulados; Node.js; PostgreSQL; provas online; gamificacao; FormulaVest.")
    page_break(doc)

    heading(doc, "Sumario", 1)
    for item in [
        "1. Introducao",
        "2. Objetivos",
        "3. Justificativa",
        "4. Metodologia e tecnologias",
        "5. Arquitetura do sistema",
        "6. Modelo de dados",
        "7. Funcionalidades por perfil",
        "8. Fluxos principais",
        "9. Seguranca, privacidade e integridade",
        "10. Testes e validacao",
        "11. Implantacao e operacao",
        "12. Manutencao evolutiva",
        "13. Conclusao",
        "Apendices",
    ]:
        add_para(doc, item, after=3)
    page_break(doc)

    heading(doc, "1. Introducao", 1)
    add_para(
        doc,
        "O FormulaVest foi desenvolvido como uma solucao web para apoiar estudantes e professores em rotinas de preparacao para provas. "
        "A aplicacao centraliza simulados, historico de desempenho, ranking, conquistas, redacao e provas criadas por professores. "
        "A proposta combina estudo individual com interacoes de turma, permitindo que professores transmitam provas ao vivo por codigo e acompanhem resultados em tempo real.",
    )
    add_para(
        doc,
        "A necessidade do projeto surge da dificuldade de organizar estudos, aplicar atividades digitais e medir desempenho com rapidez. "
        "Ao reunir geracao de questoes, dashboards e recursos administrativos em uma unica plataforma, o sistema reduz a fragmentacao de ferramentas e facilita o acompanhamento pedagogico.",
    )

    heading(doc, "2. Objetivos", 1)
    heading(doc, "2.1 Objetivo geral", 2)
    add_para(
        doc,
        "Construir uma plataforma educacional web capaz de gerar, aplicar, corrigir e acompanhar simulados e provas, oferecendo experiencias especificas para alunos, professores e administradores.",
    )
    heading(doc, "2.2 Objetivos especificos", 2)
    add_bullets(doc, [
        "Permitir que alunos realizem simulados ENEM e Provao Paulista com registro de desempenho.",
        "Oferecer ao professor um ambiente para criar provas manuais, gerar questoes por IA, importar arquivos e transmitir provas ao vivo.",
        "Disponibilizar codigo de acesso para provas de turma e placar em tempo real.",
        "Organizar usuarios por empresa, escola, periodo e sala.",
        "Gerar relatorios em PDF e XLSX para acompanhamento pedagogico.",
        "Aplicar recursos de gamificacao, como XP, nivel, ranking e conquistas.",
        "Manter autenticacao, autorizacao por perfil e controle de usuarios banidos.",
    ])

    heading(doc, "3. Justificativa", 1)
    add_para(
        doc,
        "Ferramentas educacionais eficientes precisam combinar usabilidade, rastreabilidade e rapidez. Em ambientes escolares, a aplicacao de provas digitais deve ser simples para o professor e objetiva para o aluno. "
        "O FormulaVest atende a esse cenario ao fornecer telas especializadas, dashboards e uma camada administrativa capaz de refletir a estrutura real da instituicao.",
    )
    add_callout(
        doc,
        "Contribuicao do projeto",
        "A principal contribuicao e integrar estudo individual, prova ao vivo e gestao escolar em uma mesma base de dados, reduzindo retrabalho e viabilizando analises posteriores de desempenho.",
    )

    heading(doc, "4. Metodologia e tecnologias", 1)
    add_para(
        doc,
        "O projeto utiliza uma arquitetura web tradicional, com servidor Node.js/Express, persistencia em PostgreSQL e interface publica composta por HTML, CSS e JavaScript puro. "
        "A abordagem favorece simplicidade de deploy, baixo acoplamento entre telas e facilidade de manutencao por arquivos estaticos.",
    )
    table([
        ("Camada", "Tecnologia", "Responsabilidade"),
        ("Frontend", "HTML, CSS, JavaScript", "Telas do aluno, professor, admin, login, perfil e PWA"),
        ("Backend", "Node.js + Express", "Rotas REST, autenticacao, regras de negocio e arquivos estaticos"),
        ("Banco", "PostgreSQL", "Usuarios, provas, empresas, escolas, salas, respostas e conquistas"),
        ("IA", "OpenRouter API", "Geracao e correcao assistida por IA"),
        ("Relatorios", "PDFKit e ExcelJS", "Exportacao de PDFs e planilhas XLSX"),
        ("Infra", "Docker, docker-compose, GitHub Actions", "Ambiente local, banco e CI basico"),
    ], [1800, 2300, 5260])

    heading(doc, "5. Arquitetura do sistema", 1)
    add_para(
        doc,
        "A aplicacao e organizada por responsabilidades. O arquivo server.js configura middlewares globais, seguranca, CORS, JSON, arquivos estaticos e registra modulos de rotas. "
        "As rotas ficam em routes/, servicos externos em services/, configuracoes em config/ e interfaces estaticas em public/.",
    )
    table([
        ("Modulo", "Descricao"),
        ("server.js", "Inicializacao do Express, middlewares, arquivos estaticos e registro das rotas."),
        ("config/database.js", "Conexao PostgreSQL, criacao do schema inicial e usuario master."),
        ("middlewares/auth.js", "JWT, payload do usuario e middleware de permissao por perfil."),
        ("routes/auth.js", "Registro, verificacao de email, login, refresh token e reset de senha."),
        ("routes/provas.js", "Simulados, provas de professor, prova ao vivo, respostas, exports e PDF."),
        ("routes/admin.js", "Gestao de usuarios, alunos, professores, estrutura escolar, empresas e estatisticas."),
        ("routes/user.js", "Perfil, XP, conquistas, upload de foto e dados do usuario logado."),
        ("public/", "Telas e scripts do aluno, professor, admin, login, perfil e PWA."),
    ], [2600, 6760])
    add_callout(
        doc,
        "Fluxo macro",
        "Navegador -> arquivos public/ -> fetch para rotas Express -> validacao JWT -> regras de permissao -> consultas PostgreSQL -> resposta JSON ou arquivo exportado.",
    )

    heading(doc, "6. Modelo de dados", 1)
    add_para(
        doc,
        "O modelo de dados representa usuarios, estrutura institucional, provas individuais, provas de professor e respostas. "
        "A separacao entre provas_ativas, provas e provas_professor permite distinguir simulados individuais de avaliacoes criadas por professores.",
    )
    table([
        ("Tabela", "Finalidade principal"),
        ("usuarios", "Conta, email, senha, verificacao, XP, nivel, papel, empresa, escola, periodo e sala."),
        ("empresas", "Organizacao mantenedora de escolas."),
        ("escolas", "Unidades vinculadas a uma empresa."),
        ("periodos", "Agrupamentos escolares dentro da escola."),
        ("salas", "Turmas vinculadas a periodos."),
        ("provas_ativas", "Simulados individuais ainda em andamento."),
        ("provas", "Historico de simulados finalizados pelo aluno."),
        ("provas_professor", "Provas criadas por professores, com codigo, status e questoes JSONB."),
        ("respostas_provas_professor", "Respostas de alunos em provas de professor, com nota e marcador finalizada."),
        ("provas_professor_participantes", "Controle de entrada e limite de alunos por prova ao vivo."),
        ("conquistas_historico", "Registro de conquistas obtidas pelos alunos."),
        ("refresh_tokens", "Sessao persistente por cookie httpOnly."),
    ], [2600, 6760])

    heading(doc, "6.1 Regras importantes de dados", 2)
    add_bullets(doc, [
        "Usuarios possuem role para controle de autorizacao: formulavest_master, empresa_admin, diretor, coordenador, professor e aluno.",
        "Provas de professor armazenam questoes em JSONB para permitir importacao e geracao flexivel.",
        "Respostas parciais da prova ao vivo sao mantidas sem bloquear a finalizacao definitiva.",
        "O limite de participantes e controlado por max_alunos e pela tabela provas_professor_participantes.",
        "O historico de conquistas evita duplicidade e permite exibir marcos de evolucao.",
    ])

    heading(doc, "7. Funcionalidades por perfil", 1)
    table([
        ("Perfil", "Funcionalidades"),
        ("Aluno", "Gerar simulados, responder provas com codigo, visualizar ranking, XP, conquistas, redacao e perfil."),
        ("Professor", "Criar/importar provas, gerar questoes por IA, transmitir prova ao vivo, acompanhar placar e exportar relatorios."),
        ("Coordenador/Diretor", "Gerenciar alunos/professores dentro da escola, estrutura e acompanhamento."),
        ("Admin da empresa", "Gerenciar escolas, usuarios e dados da empresa."),
        ("Master", "Gerenciar empresas, admins e visao global da plataforma."),
    ], [1900, 7460])

    heading(doc, "8. Fluxos principais", 1)
    heading(doc, "8.1 Geracao de simulado individual", 2)
    add_numbered(doc, [
        "Aluno acessa a tela principal e escolhe ENEM ou Provao Paulista.",
        "O frontend chama /gerar-enem ou /gerar-provao com JWT.",
        "O backend solicita questoes a IA e salva a prova em provas_ativas.",
        "O frontend renderiza as questoes e habilita o botao de finalizar.",
        "Ao finalizar, /salvar-prova corrige pelo gabarito salvo, registra provas e atualiza XP/nivel.",
    ])
    heading(doc, "8.2 Prova ao vivo", 2)
    add_numbered(doc, [
        "Professor cria uma prova e escolhe a sala e limite de alunos.",
        "Professor clica em Transmitir; a prova recebe codigo, status ativa e horarios de inicio/fim.",
        "Aluno entra pelo codigo; o sistema valida status, sala, limite de participantes e tempo.",
        "Aluno responde pergunta a pergunta; as respostas parciais atualizam o placar.",
        "No final, a resposta e marcada como finalizada, XP e atualizado e o professor pode exportar resultados.",
    ])
    heading(doc, "8.3 Administracao", 2)
    add_numbered(doc, [
        "Admin entra no painel administrativo.",
        "A tela carrega perfil, estatisticas, usuarios, provas e estrutura escolar.",
        "Operacoes de criacao/edicao usam rotas protegidas por role.",
        "Professores podem ser associados a salas para limitar seu escopo operacional.",
    ])

    heading(doc, "9. Seguranca, privacidade e integridade", 1)
    add_bullets(doc, [
        "Autenticacao baseada em JWT no header Authorization.",
        "Refresh token armazenado em cookie httpOnly para sessao persistente.",
        "Senhas com hash bcrypt.",
        "Middleware permitir(...) controla acesso por perfil.",
        "CORS restrito a origens configuradas.",
        "Helmet, rate limit e limites de payload reduzem riscos comuns.",
        "Uploads de prova aceitam apenas PDF e DOCX com limite de tamanho.",
        "Alunos banidos sao bloqueados no login.",
    ])
    add_callout(
        doc,
        "Ponto de atencao",
        "A seguranca depende de JWT_SECRET forte, MASTER_PASSWORD seguro, uso de HTTPS em producao e controle adequado das variaveis .env.",
    )

    heading(doc, "10. Testes e validacao", 1)
    add_para(
        doc,
        "Foram executadas verificacoes de sintaxe nos arquivos JavaScript principais e uma varredura em todos os arquivos JS fora de node_modules. "
        "Tambem foi executada a suite Jest existente, que valida o retorno basico da aplicacao.",
    )
    table([
        ("Verificacao", "Resultado"),
        ("node --check public/script.js", "Aprovado"),
        ("node --check routes/provas.js", "Aprovado"),
        ("node --check config/database.js", "Aprovado"),
        ("node --check public/sw.js", "Aprovado apos correcao"),
        ("Varredura node --check em JS do projeto", "Aprovada"),
        ("npm.cmd run lint", "Aprovado"),
        ("npm.cmd test -- --runInBand", "1 suite / 1 teste aprovado"),
    ], [3400, 5960])

    heading(doc, "10.1 Correcoes realizadas nesta revisao", 2)
    add_bullets(doc, [
        "Geracao de ENEM e Provao recebeu estado de carregamento, tratamento de erro e validacao de questoes antes de renderizar.",
        "Renderizacao das alternativas passou a usar botoes com classe .alternativa, evitando comportamento visual inconsistente.",
        "Fluxo de prova ao vivo foi corrigido para separar resposta parcial de resposta finalizada.",
        "Tabela respostas_provas_professor recebeu coluna finalizada, tambem registrada em migration SQL.",
        "Schema inicial passou a criar max_alunos e provas_professor_participantes, estruturas usadas pelo fluxo ao vivo.",
        "Service worker teve erro de sintaxe corrigido e cache atualizado para v2.",
    ])

    heading(doc, "11. Implantacao e operacao", 1)
    add_para(
        doc,
        "O projeto pode ser executado localmente com PostgreSQL via Docker Compose ou implantado em ambiente Node.js 20 com PostgreSQL externo. "
        "O arquivo .env.example descreve variaveis essenciais como DATABASE_URL, JWT_SECRET, MASTER_PASSWORD, credenciais de email e OpenRouter.",
    )
    add_numbered(doc, [
        "Copiar .env.example para .env.",
        "Subir o PostgreSQL com docker compose up -d postgres.",
        "Instalar dependencias com npm install ou npm ci.",
        "Executar migrations com npm run db:migrate quando necessario.",
        "Iniciar em desenvolvimento com npm run dev ou em producao com npm start.",
    ])
    table([
        ("Variavel", "Descricao"),
        ("DATABASE_URL", "String de conexao PostgreSQL."),
        ("DATABASE_SSL", "Ativa SSL quando necessario em producao."),
        ("JWT_SECRET", "Chave de assinatura dos tokens."),
        ("MASTER_PASSWORD", "Senha inicial do usuario master."),
        ("OUTLOOK_EMAIL / OUTLOOK_APP_PASSWORD", "Envio de emails transacionais."),
        ("OPENROUTER_API_KEY / MODEL / URL", "Geracao e correcao por IA."),
    ], [2800, 6560])

    heading(doc, "12. Manutencao evolutiva", 1)
    add_para(
        doc,
        "A manutencao deve priorizar migracoes consistentes, testes automatizados para rotas criticas e melhoria gradual da experiencia visual. "
        "A aplicacao ja possui separacao de modulos suficiente para permitir evolucao sem reescrever o sistema inteiro.",
    )
    add_bullets(doc, [
        "Adicionar testes de integracao para /gerar-enem, /salvar-prova, /professor/provas e /provas-prontas.",
        "Criar testes de permissao para todos os perfis administrativos.",
        "Padronizar encoding dos arquivos para UTF-8 e revisar textos com mojibake.",
        "Ampliar observabilidade com logs estruturados por rota e usuario.",
        "Melhorar CI para executar node --check em todos os arquivos JS e rodar Jest com banco de teste.",
        "Adicionar pagina de status para IA/email e tratamentos de fallback.",
    ])

    heading(doc, "13. Conclusao", 1)
    add_para(
        doc,
        "O FormulaVest apresenta uma base funcional para uma plataforma educacional completa, com recursos de estudo individual, prova ao vivo e gestao institucional. "
        "A arquitetura escolhida e objetiva e adequada ao escopo do projeto, enquanto o uso de PostgreSQL, Express e interfaces estaticas facilita implantacao e manutencao.",
    )
    add_para(
        doc,
        "A revisao tecnica corrigiu pontos que afetavam diretamente a experiencia do aluno e do professor, especialmente a exibicao de provas geradas e a finalizacao da prova ao vivo. "
        "Com a documentacao e as migracoes atualizadas, o projeto fica mais preparado para evolucao, testes e apresentacao academica.",
    )

    page_break(doc)
    heading(doc, "Referencias", 1)
    add_bullets(doc, [
        "Documentacao oficial do Node.js e Express para aplicacoes web.",
        "Documentacao do PostgreSQL para modelagem relacional e tipos JSONB.",
        "Documentacao das bibliotecas bcrypt, jsonwebtoken, multer, pdfkit e exceljs.",
        "Arquivos-fonte do projeto FormulaVest analisados nesta revisao.",
    ])

    heading(doc, "Apendice A - Rotas principais", 1)
    table([
        ("Grupo", "Rotas exemplares"),
        ("Autenticacao", "/register, /verificar-email, /login-iniciar, /login-confirmar, /token/refresh, /logout"),
        ("Aluno", "/me, /dashboard, /ranking, /gerar-enem, /gerar-provao, /salvar-prova"),
        ("Prova ao vivo", "/provas-prontas/entrar, /provas-prontas/:id/responder, /provas-prontas/:id/finalizar"),
        ("Professor", "/professor/provas, /professor/provas/:id/iniciar, /professor/provas/:id/placar, /professor/salas"),
        ("Admin", "/admin/usuarios, /admin/criar-aluno, /admin/escolas, /admin/periodos/:id, /admin/salas/:id"),
        ("Master", "/master/stats, /master/empresas, /master/criar-empresa, /master/criar-admin"),
    ], [2300, 7060])

    heading(doc, "Apendice B - Checklist operacional", 1)
    add_bullets(doc, [
        "Executar migrations antes de liberar nova versao.",
        "Limpar cache do service worker quando arquivos publicos mudarem.",
        "Validar login de aluno, professor e admin.",
        "Criar uma prova de professor, transmitir, entrar com aluno, responder e exportar placar.",
        "Gerar ENEM/Provao, responder e confirmar registro no dashboard.",
        "Verificar variaveis de IA e email em producao.",
    ])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    return OUT


if __name__ == "__main__":
    print(build_doc())
