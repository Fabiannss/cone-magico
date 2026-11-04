import sqlite3
import hashlib
import json
import os
import shutil
from datetime import datetime, timedelta


def get_db_path():
    if os.environ.get("VERCEL"):
        tmp_db = "/tmp/conemagico_sorvetes.db"
        orig_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "conemagico_sorvetes.db")
        if not os.path.exists(tmp_db) and os.path.exists(orig_db):
            shutil.copy2(orig_db, tmp_db)
        return tmp_db
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "conemagico_sorvetes.db")


DB_PATH = get_db_path()


def get_connection():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Tabela de Usuários (ADMIN = Dono | FUNCIONARIO = Caixa/Atendente)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK(perfil IN ('admin', 'funcionario')),
        cargo TEXT,
        turno TEXT DEFAULT 'Integral',
        telefone TEXT,
        salario_base REAL DEFAULT 1800.0,
        ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Tabela de Cardápio / Produtos (Sorvetes, Casquinhas, Taças, Milkshakes, Picolés, Adicionais)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        categoria TEXT NOT NULL,
        sabor_detalhe TEXT,
        preco REAL NOT NULL,
        custo_unitario REAL DEFAULT 0.0,
        disponivel INTEGER DEFAULT 1,
        destaque INTEGER DEFAULT 0,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Tabela de Estoque & Insumos (Com Alerta de Estoque Mínimo)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item TEXT NOT NULL,
        categoria TEXT NOT NULL,
        unidade TEXT NOT NULL DEFAULT 'un',
        quantidade_atual REAL NOT NULL DEFAULT 0,
        quantidade_minima REAL NOT NULL DEFAULT 5,
        custo_reposicao REAL DEFAULT 0.0,
        fornecedor TEXT,
        atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 4. Tabela de Clientes & Programa Fidelidade (A cada 10 sorvetes = 1 grátis)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf TEXT UNIQUE,
        telefone TEXT,
        sabor_favorito TEXT,
        pontos_fidelidade INTEGER DEFAULT 0,
        premios_resgatados INTEGER DEFAULT 0,
        total_compras REAL DEFAULT 0.0,
        status TEXT DEFAULT 'Ativo' CHECK(status IN ('Ativo', 'VIP', 'Inativo')),
        observacoes TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Tabela de Vendas / Pedidos do PDV
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_pedido TEXT NOT NULL,
        cliente_id INTEGER,
        funcionario_id INTEGER NOT NULL,
        data_venda TEXT NOT NULL,
        hora_venda TEXT NOT NULL,
        itens_resumo TEXT NOT NULL,
        itens_json TEXT,
        quantidade_sorvetes INTEGER DEFAULT 1,
        subtotal REAL NOT NULL,
        desconto REAL DEFAULT 0.0,
        valor_total REAL NOT NULL,
        forma_pagamento TEXT DEFAULT 'PIX',
        tipo_atendimento TEXT DEFAULT 'Balcão',
        status TEXT DEFAULT 'Concluída' CHECK(status IN ('Concluída', 'Em Preparo', 'Cancelada')),
        observacoes TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (funcionario_id) REFERENCES usuarios(id)
    )
    """)

    # 6. Tabela Financeira (Receitas de Vendas, Sangrias/Suprimentos de Caixa e Despesas da Sorveteria)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financeiro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL DEFAULT 'Receita' CHECK(tipo IN ('Receita', 'Despesa')),
        categoria TEXT NOT NULL DEFAULT 'Venda PDV',
        descricao TEXT NOT NULL,
        cliente_id INTEGER,
        funcionario_id INTEGER,
        venda_id INTEGER,
        valor REAL NOT NULL,
        data_vencimento TEXT NOT NULL,
        data_pagamento TEXT,
        status_pagamento TEXT DEFAULT 'Pago' CHECK(status_pagamento IN ('Pendente', 'Pago', 'Cancelado')),
        forma_pagamento TEXT DEFAULT 'PIX',
        origem_caixa TEXT DEFAULT 'PDV',
        observacoes TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (funcionario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    seed_initial_data(conn)
    ensure_default_users(conn)
    conn.close()


def ensure_default_users(conn: sqlite3.Connection):
    cursor = conn.cursor()
    adm = cursor.execute("SELECT id FROM usuarios WHERE perfil = 'admin' AND ativo = 1").fetchone()
    if not adm:
        cursor.execute(
            """
            INSERT OR IGNORE INTO usuarios (nome, email, senha_hash, perfil, cargo, turno, telefone, salario_base, ativo)
            VALUES (?, ?, ?, 'admin', 'Proprietário / Diretor Geral', 'Integral', '(11) 99999-0000', 0.0, 1)
            """,
            ("ADMIN (Dono — Cone Mágico)", "admin", hash_password("123456")),
        )
    func = cursor.execute("SELECT id FROM usuarios WHERE perfil = 'funcionario' AND ativo = 1").fetchone()
    if not func:
        cursor.execute(
            """
            INSERT OR IGNORE INTO usuarios (nome, email, senha_hash, perfil, cargo, turno, telefone, salario_base, ativo)
            VALUES (?, ?, ?, 'funcionario', 'Operador(a) de Caixa & Balcão', 'Tarde / Noite', '(11) 98888-1122', 1950.0, 1)
            """,
            ("Camila Rocha (Funcionária)", "funcionario", hash_password("123456")),
        )
    conn.commit()


def seed_initial_data(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM usuarios")
    if cursor.fetchone()["total"] > 0:
        return

    hoje = datetime.now().strftime("%Y-%m-%d")
    ontem = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    dois_dias = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    cinco_dias = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    venc_futuro = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    # 1. Usuários iniciais (ADMIN e FUNCIONÁRIO)
    usuarios = [
        (
            "ADMIN (Dono — Cone Mágico)",
            "admin",
            hash_password("123456"),
            "admin",
            "Proprietário / Administração Geral",
            "Integral",
            "(11) 99999-0000",
            0.0,
        ),
        (
            "Camila Rocha (Caixa / Balcão)",
            "funcionario",
            hash_password("123456"),
            "funcionario",
            "Operadora de Caixa & Atendimento",
            "Manhã / Tarde (10h às 18h)",
            "(11) 98812-3456",
            1950.0,
        ),
        (
            "Lucas Ferreira (Sorveteiro / Balcão)",
            "lucas",
            hash_password("123456"),
            "funcionario",
            "Atendente & Montagem de Taças",
            "Tarde / Noite (14h às 22h)",
            "(11) 97741-8520",
            1850.0,
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO usuarios (nome, email, senha_hash, perfil, cargo, turno, telefone, salario_base)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        usuarios,
    )

    # 2. Cardápio de Produtos da Sorveteria CONE MÁGICO
    produtos = [
        ("Casquinha Mágica (1 Bola)", "Casquinha / Cascão", "Morango, Chocolate Belga, Baunilha ou Flocos", 10.00, 3.20, 1, 1),
        ("Cascão Duplo Artesanal (2 Bolas)", "Casquinha / Cascão", "Borda de Nutella + 2 sabores à escolha", 18.00, 5.80, 1, 1),
        ("Cone Mágico Supremo (3 Bolas + Calda)", "Casquinha / Cascão", "Cascão de Waffle, Pistache, Ninho Trufado e Framboesa", 24.00, 7.90, 1, 1),
        ("Copinho Cremoso (2 Bolas)", "Copo / Sundae", "Acompanha cobertura e farofa crocante", 15.00, 4.50, 1, 0),
        ("Sundae Especial Cone Mágico", "Copo / Sundae", "2 Bolas, chantilly, calda quente de chocolate, castanhas e cereja", 22.00, 6.90, 1, 1),
        ("Taça Ferrero & Ninho", "Copo / Sundae", "Sorvete de Ninho e Chocolate, creme de avelã, bombom e chantilly", 32.00, 10.50, 1, 1),
        ("Taça Banana Split Mágica", "Taças Especiais", "3 bolas de sorvete artesanal, banana, chantilly, calda de chocolate e castanhas", 24.00, 7.50, 1, 1),
        ("Taça Brownie & Gelato Belga", "Taças Especiais", "Brownie quentinho com 2 bolas de sorvete artesanal e calda de ganache", 26.00, 8.90, 1, 1),
        ("Milkshake Ovomaltine Crocante 400ml", "Milkshake", "Sorvete artesanal de baunilha, flocos crocantes e chantilly", 21.00, 6.40, 1, 1),
        ("Milkshake Morango Silvestre 400ml", "Milkshake", "Sorvete de morango com pedaços da fruta e calda artesanal", 20.00, 6.00, 1, 0),
        ("Picolé Artesanal Pistache Premium", "Picolé Artesanal", "Cobertura de chocolate branco e pistache torrado", 14.00, 4.50, 1, 1),
        ("Picolé Artesanal Ninho Trufado", "Picolé Artesanal", "Recheio cremoso de trufa de chocolate meio amargo", 12.00, 3.80, 1, 0),
        ("Pote Família 1,5L (Leve p/ Casa)", "Pote / Viagem", "Até 3 sabores artesanais à escolha do cliente", 48.00, 16.00, 1, 1),
        ("Adicional de Nutella / Creme de Avelã", "Adicional / Calda", "Porção extra generosa 40g", 6.00, 2.10, 1, 0),
        ("Adicional Castanha / Confete / Chantilly", "Adicional / Calda", "Porção extra de topping", 4.00, 1.20, 1, 0),
    ]
    cursor.executemany(
        """
        INSERT INTO produtos (nome, categoria, sabor_detalhe, preco, custo_unitario, disponivel, destaque)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        produtos,
    )

    # 3. Estoque & Insumos (Com alguns itens em estoque baixo para demonstrar alerta)
    itens_estoque = [
        ("Base Láctea Artesanal Premium", "Bases & Laticínios", "L", 42.0, 20.0, 14.50, "Laticínios Serra Dourada"),
        ("Pasta Italiana de Pistache Puro", "Bases & Laticínios", "kg", 2.5, 5.0, 145.00, "Importadora Gelato Brasil"),
        ("Creme de Leite Fresco & Base Gelato (10L)", "Bases & Laticínios", "cx", 6.0, 3.0, 135.00, "Laticínios Serra Dourada"),
        ("Morango Fresco Selecionado", "Polpas & Frutas", "kg", 3.0, 8.0, 22.00, "Horta & Fruta Express"),
        ("Casquinha e Cascão de Waffle Artesanal", "Casquinhas & Biscoitos", "un", 45.0, 80.0, 0.85, "Fábrica Crocante Cones"),
        ("Copos Biodegradáveis 300ml/500ml (Pct 100)", "Embalagens & Copos", "pct", 9.0, 4.0, 24.00, "EcoPack Embalagens"),
        ("Potes Térmicos 1,5L Personalizados", "Embalagens & Copos", "un", 28.0, 15.0, 3.40, "EcoPack Embalagens"),
        ("Balde de Nutella / Creme de Avelã 3kg", "Caldas & Confeitos", "un", 1.0, 3.0, 165.00, "Distribuidora Doce Mais"),
        ("Leite em Pó Ninho Integral (Pacote 800g)", "Caldas & Confeitos", "pct", 11.0, 5.0, 34.90, "Atacadão Alimentos"),
        ("Picolés Artesanais Prontos (Grade Sortida)", "Picolés Prontos", "un", 95.0, 40.0, 3.90, "Produção Própria Cone Mágico"),
    ]
    cursor.executemany(
        """
        INSERT INTO estoque (item, categoria, unidade, quantidade_atual, quantidade_minima, custo_reposicao, fornecedor)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        itens_estoque,
    )

    # 4. Clientes & Programa Fidelidade
    clientes = [
        ("Mariana Costa Silva", "345.678.901-12", "(11) 98765-4321", "Cascão Duplo (Pistache & Ninho)", 9, 1, 246.00, "VIP", "Falta apenas 1 sorvete para ganhar o 2º prêmio fidelidade!"),
        ("Pedro Henrique Almeida", "412.890.123-45", "(11) 97654-3210", "Taça Brownie & Gelato Belga", 10, 2, 390.00, "VIP", "Tem 1 prêmio disponível para resgate imediato!"),
        ("Beatriz Ferreira Lima", "289.456.123-88", "(11) 96543-2109", "Milkshake Ovomaltine", 5, 0, 125.00, "Ativo", "Cliente frequente aos finais de semana."),
        ("Família Oliveira (Roberto)", "198.234.567-00", "(11) 95432-1098", "Pote Família 1,5L", 8, 1, 340.00, "VIP", "Costuma levar Pote Família aos domingos."),
    ]
    cursor.executemany(
        """
        INSERT INTO clientes (nome, cpf, telefone, sabor_favorito, pontos_fidelidade, premios_resgatados, total_compras, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        clientes,
    )

    # 5. Vendas Iniciais do PDV
    vendas = [
        (
            "CM-1001",
            1,
            2,
            hoje,
            "13:15",
            "2x Cascão Duplo Artesanal (2 Bolas), 1x Adicional de Nutella",
            json.dumps([
                {"produto_id": 2, "nome": "Cascão Duplo Artesanal (2 Bolas)", "qtd": 2, "preco": 18.00, "subtotal": 36.00},
                {"produto_id": 14, "nome": "Adicional de Nutella / Creme de Avelã", "qtd": 1, "preco": 6.00, "subtotal": 6.00},
            ], ensure_ascii=False),
            2,
            42.00,
            0.00,
            42.00,
            "PIX",
            "Balcão",
            "Concluída",
            "Borda caprichada de Nutella",
        ),
        (
            "CM-1002",
            2,
            2,
            hoje,
            "14:10",
            "1x Taça Brownie & Gelato Belga, 1x Picolé Artesanal Pistache Premium",
            json.dumps([
                {"produto_id": 8, "nome": "Taça Brownie & Gelato Belga", "qtd": 1, "preco": 26.00, "subtotal": 26.00},
                {"produto_id": 11, "nome": "Picolé Artesanal Pistache Premium", "qtd": 1, "preco": 14.00, "subtotal": 14.00},
            ], ensure_ascii=False),
            2,
            40.00,
            0.00,
            40.00,
            "Cartão de Crédito",
            "Mesa",
            "Concluída",
            "Mesa 04",
        ),
        (
            "CM-1003",
            3,
            3,
            hoje,
            "14:35",
            "1x Taça Ferrero & Ninho, 1x Milkshake Ovomaltine Crocante 400ml",
            json.dumps([
                {"produto_id": 6, "nome": "Taça Ferrero & Ninho", "qtd": 1, "preco": 32.00, "subtotal": 32.00},
                {"produto_id": 9, "nome": "Milkshake Ovomaltine Crocante 400ml", "qtd": 1, "preco": 21.00, "subtotal": 21.00},
            ], ensure_ascii=False),
            2,
            53.00,
            0.00,
            53.00,
            "PIX",
            "Balcão",
            "Concluída",
            "",
        ),
        (
            "CM-1004",
            4,
            2,
            ontem,
            "17:20",
            "2x Pote Família 1,5L (Leve p/ Casa), 2x Cone Mágico Supremo",
            json.dumps([
                {"produto_id": 13, "nome": "Pote Família 1,5L (Leve p/ Casa)", "qtd": 2, "preco": 48.00, "subtotal": 96.00},
                {"produto_id": 3, "nome": "Cone Mágico Supremo (3 Bolas + Calda)", "qtd": 2, "preco": 24.00, "subtotal": 48.00},
            ], ensure_ascii=False),
            4,
            144.00,
            4.00,
            140.00,
            "Cartão de Débito",
            "Viagem / Retirada",
            "Concluída",
            "Embalagem térmica para viagem",
        ),
    ]
    cursor.executemany(
        """
        INSERT INTO vendas (
            codigo_pedido, cliente_id, funcionario_id, data_venda, hora_venda,
            itens_resumo, itens_json, quantidade_sorvetes, subtotal, desconto,
            valor_total, forma_pagamento, tipo_atendimento, status, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        vendas,
    )

    # 6. Lançamentos Financeiros (Receitas do PDV, Sangrias Rápidas do Caixa e Despesas da Sorveteria)
    lancamentos = [
        ("Receita", "Venda PDV", "Pedido #CM-1001 — 2x Cascão Duplo + Adicional Nutella", 1, 2, 1, 42.00, hoje, hoje, "Pago", "PIX", "PDV", "Venda balcão"),
        ("Receita", "Venda PDV", "Pedido #CM-1002 — Taça Brownie & Gelato + Picolé Pistache", 2, 2, 2, 40.00, hoje, hoje, "Pago", "Cartão de Crédito", "PDV", "Mesa 04"),
        ("Receita", "Venda PDV", "Pedido #CM-1003 — Taça Ferrero & Ninho + Milkshake", 3, 3, 3, 53.00, hoje, hoje, "Pago", "PIX", "PDV", "Venda balcão"),
        ("Receita", "Venda PDV", "Pedido #CM-1004 — 2x Pote Família 1,5L + 2x Cone Supremo", 4, 2, 4, 140.00, ontem, ontem, "Pago", "Cartão de Débito", "PDV", "Viagem"),
        ("Receita", "Encomenda / Evento", "Combo Festa 60 Picolés Artesanais Sortidos — Aniversário Infantil", 1, 1, None, 620.00, dois_dias, dois_dias, "Pago", "PIX", "Admin", "Sinal + Quitação na entrega"),
        ("Receita", "Encomenda / Evento", "Reserva 3 Potes Família 1,5L p/ Fim de Semana", 4, 2, None, 144.00, hoje, None, "Pendente", "PIX", "PDV", "Cliente pagará na retirada às 18h"),
        ("Despesa", "Sangria / Despesa Rápida de Caixa", "Compra emergencial de gelo filtrado e guardanapos p/ balcão", None, 2, None, 38.00, hoje, hoje, "Pago", "Dinheiro", "Caixa Rápido", "Lançado pela funcionária Camila no caixa"),
        ("Despesa", "Fornecedores / Laticínios & Polpas", "Reposição de Base Láctea, Creme de Leite e Pasta de Pistache", None, 1, None, 485.00, cinco_dias, cinco_dias, "Pago", "PIX", "Admin", "Laticínios Serra Dourada"),
        ("Despesa", "Energia Elétrica (Freezers)", "Conta de Energia Elétrica Comercial (Refrigeração / Ilha de Freezers)", None, 1, None, 640.00, ontem, ontem, "Pago", "Transferência", "Admin", "Fatura mensal"),
        ("Despesa", "Embalagens & Casquinhas", "Pedido de Copos Biodegradáveis, Colheres e Casquinhas de Waffle", None, 1, None, 290.00, venc_futuro, None, "Pendente", "Boleto / PIX", "Admin", "Boleto fornecedor EcoPack"),
        ("Despesa", "Aluguel da Sorveteria", "Locação do Ponto Comercial — Sorveteria Cone Mágico", None, 1, None, 1800.00, venc_futuro, None, "Pendente", "Transferência", "Admin", "Vencimento dia 10"),
    ]
    cursor.executemany(
        """
        INSERT INTO financeiro (
            tipo, categoria, descricao, cliente_id, funcionario_id, venda_id,
            valor, data_vencimento, data_pagamento, status_pagamento,
            forma_pagamento, origem_caixa, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        lancamentos,
    )

    conn.commit()
