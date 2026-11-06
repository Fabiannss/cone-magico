import sqlite3
import hashlib
import json
import os
import shutil
import urllib.request
import urllib.error
from datetime import datetime, timedelta

_DB_INITIALIZED = False


def get_turso_config():
    url = (
        os.environ.get("TURSO_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or os.environ.get("LIBSQL_URL")
        or ""
    ).strip()
    token = (
        os.environ.get("TURSO_AUTH_TOKEN")
        or os.environ.get("DATABASE_AUTH_TOKEN")
        or os.environ.get("LIBSQL_AUTH_TOKEN")
        or ""
    ).strip()
    if not url or not token:
        return None, None
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://") :]
    elif url.startswith("wss://"):
        url = "https://" + url[len("wss://") :]
    elif url.startswith("http://"):
        url = "https://" + url[len("http://") :]
    url = url.rstrip("/")
    return url, token


def _format_turso_arg(val):
    if val is None:
        return {"type": "null"}
    if isinstance(val, bool):
        return {"type": "integer", "value": "1" if val else "0"}
    if isinstance(val, int):
        return {"type": "integer", "value": str(val)}
    if isinstance(val, float):
        return {"type": "float", "value": float(val)}
    return {"type": "text", "value": str(val)}


def _parse_turso_cell(cell):
    if not isinstance(cell, dict):
        return cell
    ctype = cell.get("type")
    val = cell.get("value")
    if ctype == "null" or val is None:
        return None
    if ctype == "integer":
        try:
            return int(val)
        except (ValueError, TypeError):
            return val
    if ctype == "float":
        try:
            return float(val)
        except (ValueError, TypeError):
            return val
    return str(val)


class TursoCursor:
    def __init__(self, conn: "TursoConnection"):
        self.conn = conn
        self._rows = []
        self._idx = 0
        self.lastrowid = None
        self.rowcount = 0

    def execute(self, sql: str, params=()):
        stmt = {"sql": sql}
        if params:
            stmt["args"] = [_format_turso_arg(p) for p in params]
        res = self.conn._pipeline([{"type": "execute", "stmt": stmt}])
        if res:
            self._load_result(res[0])
        return self

    def executemany(self, sql: str, seq_of_params):
        requests = []
        for params in seq_of_params:
            stmt = {"sql": sql, "args": [_format_turso_arg(p) for p in params]}
            requests.append({"type": "execute", "stmt": stmt})
        if not requests:
            return self
        results = self.conn._pipeline(requests)
        if results:
            self._load_result(results[-1])
        return self

    def _load_result(self, result_obj: dict):
        cols = [c.get("name", f"col_{i}") for i, c in enumerate(result_obj.get("cols") or [])]
        raw_rows = result_obj.get("rows") or []
        parsed = []
        for r in raw_rows:
            row_dict = {}
            for i, col_name in enumerate(cols):
                row_dict[col_name] = _parse_turso_cell(r[i]) if i < len(r) else None
            parsed.append(row_dict)
        self._rows = parsed
        self._idx = 0
        lid = result_obj.get("last_insert_rowid")
        if lid is not None:
            try:
                self.lastrowid = int(lid)
            except (ValueError, TypeError):
                self.lastrowid = lid
        self.rowcount = result_obj.get("affected_row_count", len(parsed))

    def fetchone(self):
        if self._idx < len(self._rows):
            row = self._rows[self._idx]
            self._idx += 1
            return row
        return None

    def fetchall(self):
        rem = self._rows[self._idx :]
        self._idx = len(self._rows)
        return rem


class TursoConnection:
    def __init__(self, base_url: str, auth_token: str):
        self.endpoint = f"{base_url}/v2/pipeline"
        self.auth_token = auth_token

    def _pipeline(self, exec_requests: list):
        payload = {"requests": exec_requests + [{"type": "close"}]}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {self.auth_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Erro HTTP Turso ({e.code}): {err_body}") from e

        results = []
        for item in body.get("results", []):
            if item.get("type") == "error":
                err = item.get("error", {})
                raise RuntimeError(f"Erro SQL Turso: {err.get('message', err)}")
            resp_obj = item.get("response", {})
            if resp_obj.get("type") == "execute":
                results.append(resp_obj.get("result", {}))
        return results

    def cursor(self):
        return TursoCursor(self)

    def execute(self, sql: str, params=()):
        cur = TursoCursor(self)
        return cur.execute(sql, params)

    def executemany(self, sql: str, seq_of_params):
        cur = TursoCursor(self)
        return cur.executemany(sql, seq_of_params)

    def commit(self):
        pass

    def close(self):
        pass


def get_db_path():
    if os.environ.get("VERCEL"):
        tmp_db = "/tmp/conemagico_loja.db"
        orig_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "conemagico_loja.db")
        if not os.path.exists(tmp_db) and os.path.exists(orig_db):
            shutil.copy2(orig_db, tmp_db)
        return tmp_db
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "conemagico_loja.db")


DB_PATH = get_db_path()


def is_turso_enabled() -> bool:
    url, token = get_turso_config()
    return bool(url and token)


def get_connection():
    turso_url, turso_token = get_turso_config()
    if turso_url and turso_token:
        return TursoConnection(turso_url, turso_token)
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def init_db():
    global _DB_INITIALIZED
    if _DB_INITIALIZED:
        return

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

    # 2. Tabela de Cardápio / Produtos (Sorvetes, Casquinhas, Taças, Milkshakes, Picolés, Potes, Adicionais)
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

    # 5. Tabela de Vendas / Pedidos do PDV e Cardápio Digital (/pedir)
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
        endereco_entrega TEXT,
        taxa_entrega REAL DEFAULT 0.0,
        troco_para REAL DEFAULT 0.0,
        modalidade_entrega TEXT DEFAULT 'Balcão',
        status_delivery TEXT DEFAULT 'Concluído',
        entregador_info TEXT,
        cliente_telefone TEXT,
        cliente_nome_avulso TEXT,
        link_rastreio_99 TEXT,
        motoboy_lat REAL,
        motoboy_lng REAL,
        motoboy_atualizado_em TEXT,
        loja_lat REAL DEFAULT -23.55052,
        loja_lng REAL DEFAULT -46.633308,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (funcionario_id) REFERENCES usuarios(id)
    )
    """)

    # Migração automática para bancos já existentes (Turso / SQLite)
    novas_colunas_vendas = [
        ("endereco_entrega", "TEXT"),
        ("taxa_entrega", "REAL DEFAULT 0.0"),
        ("troco_para", "REAL DEFAULT 0.0"),
        ("modalidade_entrega", "TEXT DEFAULT 'Balcão'"),
        ("status_delivery", "TEXT DEFAULT 'Concluído'"),
        ("entregador_info", "TEXT"),
        ("cliente_telefone", "TEXT"),
        ("cliente_nome_avulso", "TEXT"),
        ("link_rastreio_99", "TEXT"),
        ("motoboy_lat", "REAL"),
        ("motoboy_lng", "REAL"),
        ("motoboy_atualizado_em", "TEXT"),
        ("loja_lat", "REAL DEFAULT -23.55052"),
        ("loja_lng", "REAL DEFAULT -46.633308"),
    ]
    for col_name, col_def in novas_colunas_vendas:
        try:
            cursor.execute(f"ALTER TABLE vendas ADD COLUMN {col_name} {col_def}")
        except Exception:
            pass

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
    _DB_INITIALIZED = True


def ensure_default_users(conn):
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


def seed_initial_data(conn):
    cursor = conn.cursor()
    row_count = cursor.execute("SELECT COUNT(*) as total FROM usuarios").fetchone()
    if row_count and row_count["total"] > 0:
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
            "Lucas Ferreira (Atendente / Balcão)",
            "lucas",
            hash_password("123456"),
            "funcionario",
            "Atendente de Sorveteria",
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

    # 2. Cardápio de Produtos da Sorveteria CONE MÁGICO (Sorveteria Tradicional)
    produtos = [
        ("Casquinha Simples (1 Bola)", "Casquinha / Cascão", "Sabores: Creme, Morango, Chocolate, Flocos ou Napolitano", 6.00, 1.80, 1, 1),
        ("Casquinha Dupla (2 Bolas)", "Casquinha / Cascão", "2 bolas à escolha com cobertura de chocolate, morango ou caramelo", 10.00, 3.10, 1, 1),
        ("Cascão Crocante (2 Bolas)", "Casquinha / Cascão", "Cascão recheado com calda + 2 bolas e granulado ou amendoim", 13.00, 4.20, 1, 1),
        ("Cestinha Especial (3 Bolas)", "Casquinha / Cascão", "Cestinha crocante com 3 bolas, cobertura, canudinho wafer e granulado", 17.00, 5.50, 1, 1),
        ("Copinho 200ml (2 Bolas)", "Copo / Sundae", "Sorvete de massa no copo com cobertura tradicional", 11.00, 3.40, 1, 0),
        ("Sundae Tradicional Cone Mágico", "Copo / Sundae", "2 bolas de sorvete, calda de chocolate ou morango, chantilly, amendoim e cereja", 16.00, 5.10, 1, 1),
        ("Taça Colegial", "Taças Especiais", "2 bolas de sorvete, cobertura de chocolate, chantilly, farofa doce e tubetes", 19.00, 6.20, 1, 1),
        ("Taça Banana Split", "Taças Especiais", "3 bolas (Creme, Morango e Chocolate), banana, chantilly, coberturas e cereja", 24.00, 7.80, 1, 1),
        ("Taça Cone Mágico Completa", "Taças Especiais", "3 bolas de sorvete, calda de chocolate, chantilly, jujuba, confete e biscoito", 25.00, 8.20, 1, 1),
        ("Milkshake Tradicional 400ml", "Milkshake", "Sabores Chocolate, Morango, Flocos ou Ovomaltine com chantilly", 16.00, 5.20, 1, 1),
        ("Milkshake Grande 500ml", "Milkshake", "Sabores Ovomaltine, Morango, Chocolate ou Leite Condensado", 19.00, 6.30, 1, 0),
        ("Picolé de Fruta", "Picolé", "Sabores Uva, Limão, Maracujá, Abacaxi ou Morango", 4.00, 1.30, 1, 1),
        ("Picolé Ao Leite / Cremoso", "Picolé", "Sabores Chocolate, Coco, Milho Verde, Leite Condensado ou Amendoim", 5.50, 1.90, 1, 1),
        ("Pote de Sorvete 2 Litros (Viagem)", "Pote / Viagem", "Sabores Napolitano, Flocos, Creme, Morango ou Chocolate", 28.00, 10.50, 1, 1),
        ("Adicional Cobertura / Confeitos", "Adicional / Calda", "Porção extra de cobertura, granulado, amendoim, confete ou chantilly", 3.00, 0.90, 1, 0),
    ]
    cursor.executemany(
        """
        INSERT INTO produtos (nome, categoria, sabor_detalhe, preco, custo_unitario, disponivel, destaque)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        produtos,
    )

    # 3. Estoque & Insumos da Sorveteria
    itens_estoque = [
        ("Caixa de Sorvete Napolitano / Flocos (10L)", "Massas & Caixas 10L", "cx", 8.0, 4.0, 78.00, "Distribuidora Gelados & Cia"),
        ("Caixa de Sorvete Morango / Chocolate (10L)", "Massas & Caixas 10L", "cx", 2.0, 4.0, 78.00, "Distribuidora Gelados & Cia"),
        ("Caixa de Sorvete Creme / Leite Condensado (10L)", "Massas & Caixas 10L", "cx", 6.0, 3.0, 78.00, "Distribuidora Gelados & Cia"),
        ("Casquinha de Biscoito Tradicional", "Casquinhas & Biscoitos", "un", 45.0, 80.0, 0.45, "Fábrica Crocante Cones"),
        ("Cascão e Cestinha Crocante", "Casquinhas & Biscoitos", "un", 65.0, 40.0, 0.85, "Fábrica Crocante Cones"),
        ("Copos Descartáveis e Pazinhas (Pct 100)", "Embalagens & Copos", "pct", 9.0, 4.0, 18.00, "Atacadão Embalagens"),
        ("Potes de Sorvete 2 Litros (Viagem)", "Embalagens & Copos", "un", 28.0, 15.0, 18.50, "Distribuidora Gelados & Cia"),
        ("Coberturas (Chocolate, Morango e Caramelo)", "Caldas & Confeitos", "un", 2.0, 5.0, 16.90, "Distribuidora Doce Mais"),
        ("Granulado, Amendoim, Confete e Canudinhos", "Caldas & Confeitos", "kg", 6.0, 3.0, 24.90, "Atacadão Alimentos"),
        ("Picolés de Fruta e Ao Leite (Grade Sortida)", "Picolés Prontos", "un", 110.0, 50.0, 1.60, "Distribuidora Gelados & Cia"),
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
        ("Mariana Costa Silva", "345.678.901-12", "(11) 98765-4321", "Cascão Crocante (Flocos & Morango)", 9, 1, 186.00, "VIP", "Falta apenas 1 sorvete para ganhar o 2º prêmio fidelidade!"),
        ("Pedro Henrique Almeida", "412.890.123-45", "(11) 97654-3210", "Taça Banana Split", 10, 2, 290.00, "VIP", "Tem 1 prêmio disponível para resgate imediato!"),
        ("Beatriz Ferreira Lima", "289.456.123-88", "(11) 96543-2109", "Milkshake Tradicional 400ml", 5, 0, 95.00, "Ativo", "Cliente frequente aos finais de semana."),
        ("Família Oliveira (Roberto)", "198.234.567-00", "(11) 95432-1098", "Pote de Sorvete 2 Litros", 8, 1, 240.00, "VIP", "Costuma levar Pote 2L aos domingos."),
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
            "2x Cascão Crocante (2 Bolas), 1x Adicional Cobertura / Confeitos",
            json.dumps([
                {"produto_id": 3, "nome": "Cascão Crocante (2 Bolas)", "qtd": 2, "preco": 13.00, "subtotal": 26.00},
                {"produto_id": 15, "nome": "Adicional Cobertura / Confeitos", "qtd": 1, "preco": 3.00, "subtotal": 3.00},
            ], ensure_ascii=False),
            2,
            29.00,
            0.00,
            29.00,
            "PIX",
            "Balcão",
            "Concluída",
            "Cobertura de chocolate e granulado",
        ),
        (
            "CM-1002",
            2,
            2,
            hoje,
            "14:10",
            "1x Taça Banana Split, 2x Picolé Ao Leite / Cremoso",
            json.dumps([
                {"produto_id": 8, "nome": "Taça Banana Split", "qtd": 1, "preco": 24.00, "subtotal": 24.00},
                {"produto_id": 13, "nome": "Picolé Ao Leite / Cremoso", "qtd": 2, "preco": 5.50, "subtotal": 11.00},
            ], ensure_ascii=False),
            3,
            35.00,
            0.00,
            35.00,
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
            "1x Sundae Tradicional Cone Mágico, 1x Milkshake Tradicional 400ml",
            json.dumps([
                {"produto_id": 6, "nome": "Sundae Tradicional Cone Mágico", "qtd": 1, "preco": 16.00, "subtotal": 16.00},
                {"produto_id": 10, "nome": "Milkshake Tradicional 400ml", "qtd": 1, "preco": 16.00, "subtotal": 16.00},
            ], ensure_ascii=False),
            2,
            32.00,
            0.00,
            32.00,
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
            "2x Pote de Sorvete 2 Litros (Viagem), 2x Cestinha Especial (3 Bolas)",
            json.dumps([
                {"produto_id": 14, "nome": "Pote de Sorvete 2 Litros (Viagem)", "qtd": 2, "preco": 28.00, "subtotal": 56.00},
                {"produto_id": 4, "nome": "Cestinha Especial (3 Bolas)", "qtd": 2, "preco": 17.00, "subtotal": 34.00},
            ], ensure_ascii=False),
            4,
            90.00,
            0.00,
            90.00,
            "Cartão de Débito",
            "Viagem / Retirada",
            "Concluída",
            "Sabores Napolitano e Flocos",
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
        ("Receita", "Venda PDV", "Pedido #CM-1001 — 2x Cascão Crocante + Adicional Cobertura", 1, 2, 1, 29.00, hoje, hoje, "Pago", "PIX", "PDV", "Venda balcão"),
        ("Receita", "Venda PDV", "Pedido #CM-1002 — Taça Banana Split + 2x Picolé Ao Leite", 2, 2, 2, 35.00, hoje, hoje, "Pago", "Cartão de Crédito", "PDV", "Mesa 04"),
        ("Receita", "Venda PDV", "Pedido #CM-1003 — Sundae Tradicional + Milkshake 400ml", 3, 3, 3, 32.00, hoje, hoje, "Pago", "PIX", "PDV", "Venda balcão"),
        ("Receita", "Venda PDV", "Pedido #CM-1004 — 2x Pote 2 Litros + 2x Cestinha Especial", 4, 2, 4, 90.00, ontem, ontem, "Pago", "Cartão de Débito", "PDV", "Viagem"),
        ("Receita", "Encomenda / Evento", "Encomenda 100 Picolés Sortidos (Fruta e Ao Leite) — Festa Infantil", 1, 1, None, 420.00, dois_dias, dois_dias, "Pago", "PIX", "Admin", "Sinal + Quitação na entrega"),
        ("Receita", "Encomenda / Evento", "Reserva 4 Potes de Sorvete 2 Litros p/ Fim de Semana", 4, 2, None, 112.00, hoje, None, "Pendente", "PIX", "PDV", "Cliente pagará na retirada às 18h"),
        ("Despesa", "Sangria / Despesa Rápida de Caixa", "Compra emergencial de gelo e guardanapos p/ balcão", None, 2, None, 38.00, hoje, hoje, "Pago", "Dinheiro", "Caixa Rápido", "Lançado pela funcionária Camila no caixa"),
        ("Despesa", "Fornecedores / Caixas de Sorvete & Picolés", "Reposição de Caixas 10L (Napolitano, Flocos, Morango e Chocolate)", None, 1, None, 468.00, cinco_dias, cinco_dias, "Pago", "PIX", "Admin", "Distribuidora Gelados & Cia"),
        ("Despesa", "Energia Elétrica (Freezers)", "Conta de Energia Elétrica Comercial (Freezers e Conservadoras)", None, 1, None, 640.00, ontem, ontem, "Pago", "Transferência", "Admin", "Fatura mensal"),
        ("Despesa", "Embalagens & Casquinhas", "Pedido de Copos Descartáveis, Pazinhas, Casquinhas e Cascões", None, 1, None, 260.00, venc_futuro, None, "Pendente", "Boleto / PIX", "Admin", "Boleto fornecedor"),
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
