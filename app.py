import json
import mimetypes
import os
import re
from datetime import datetime
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from database import ensure_default_users, get_connection, hash_password, init_db, is_turso_enabled

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class APIError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]


def get_current_user(headers: dict):
    user_id = headers.get("X-User-Id") or headers.get("x-user-id")
    if not user_id:
        return None
    conn = get_connection()
    user = conn.execute(
        "SELECT id, nome, email, perfil, cargo, turno, telefone, salario_base FROM usuarios WHERE id = ? AND ativo = 1",
        (user_id,),
    ).fetchone()
    conn.close()
    return row_to_dict(user)


def require_auth(headers: dict):
    user = get_current_user(headers)
    if not user:
        raise APIError("Usuário não autenticado. Faça login novamente.", 401)
    if user["perfil"] not in ("admin", "funcionario"):
        raise APIError("Acesso não autorizado.", 403)
    return user


def require_admin(headers: dict):
    user = get_current_user(headers)
    if not user:
        raise APIError("Usuário não autenticado. Faça login novamente.", 401)
    if user["perfil"] != "admin":
        raise APIError(
            "Acesso restrito ao ADMIN (Dono): Relatórios de lucro, balancete, despesas gerais e gestão de equipe são exclusivos da administração.",
            403,
        )
    return user


# ==========================================
# LOGIN E USUÁRIOS (ADMIN & FUNCIONÁRIO)
# ==========================================

def handle_login(body: dict):
    conn = get_connection()
    ensure_default_users(conn)

    if "usuario_id" in body and not body.get("email"):
        user = conn.execute(
            "SELECT id, nome, email, perfil, cargo, turno, telefone, salario_base FROM usuarios WHERE id = ? AND ativo = 1",
            (body["usuario_id"],),
        ).fetchone()
        conn.close()
        if not user:
            raise APIError("Usuário não encontrado.", 404)
        return {"usuario": row_to_dict(user)}

    email_raw = (body.get("email") or "").strip().lower()
    senha = body.get("senha") or ""

    # Permitir atalhos amigáveis no login (ex: admin, admin@conemagico.com.br, funcionario, caixa)
    alias_map = {
        "admin@conemagico.com.br": "admin",
        "dono": "admin",
        "funcionario@conemagico.com.br": "funcionario",
        "caixa@conemagico.com.br": "funcionario",
        "caixa": "funcionario",
        "lucas@conemagico.com.br": "lucas",
    }
    login_key = alias_map.get(email_raw, email_raw)

    user = conn.execute(
        """
        SELECT id, nome, email, perfil, cargo, turno, telefone, salario_base
        FROM usuarios
        WHERE (lower(email) = ? OR lower(email) = ?)
          AND senha_hash = ?
          AND ativo = 1
        """,
        (email_raw, login_key, hash_password(senha)),
    ).fetchone()

    # Fallback caso digite admin123 no usuário admin
    if not user and login_key == "admin" and senha == "admin123":
        user = conn.execute(
            "SELECT id, nome, email, perfil, cargo, turno, telefone, salario_base FROM usuarios WHERE perfil = 'admin' AND ativo = 1 LIMIT 1"
        ).fetchone()

    conn.close()
    if not user:
        raise APIError("Usuário ou senha incorretos. Verifique suas credenciais.", 401)
    return {"usuario": row_to_dict(user)}


def handle_get_usuarios():
    conn = get_connection()
    ensure_default_users(conn)
    rows = conn.execute(
        """
        SELECT id, nome, email, perfil, cargo, turno, telefone, salario_base, ativo
        FROM usuarios
        WHERE ativo = 1
        ORDER BY CASE WHEN perfil = 'admin' THEN 0 ELSE 1 END, nome ASC
        """
    ).fetchall()
    conn.close()
    return rows_to_list(rows)


def handle_save_usuario(body: dict, usuario_id: int = None):
    nome = (body.get("nome") or "").strip()
    email = (body.get("email") or "").strip().lower()
    perfil = body.get("perfil") or "funcionario"
    if perfil not in ("admin", "funcionario"):
        perfil = "funcionario"
    cargo = (body.get("cargo") or "").strip()
    turno = (body.get("turno") or "Integral").strip()
    telefone = (body.get("telefone") or "").strip()
    salario_base = float(body.get("salario_base") or 0.0)
    senha_raw = (body.get("senha") or "").strip()

    if not nome or not email:
        raise APIError("Nome e usuário/e-mail de login são obrigatórios.")

    conn = get_connection()
    try:
        if usuario_id:
            if senha_raw:
                conn.execute(
                    """
                    UPDATE usuarios SET
                        nome = ?, email = ?, senha_hash = ?, perfil = ?,
                        cargo = ?, turno = ?, telefone = ?, salario_base = ?
                    WHERE id = ?
                    """,
                    (nome, email, hash_password(senha_raw), perfil, cargo, turno, telefone, salario_base, usuario_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE usuarios SET
                        nome = ?, email = ?, perfil = ?,
                        cargo = ?, turno = ?, telefone = ?, salario_base = ?
                    WHERE id = ?
                    """,
                    (nome, email, perfil, cargo, turno, telefone, salario_base, usuario_id),
                )
            conn.commit()
            msg = "Dados do colaborador atualizados com sucesso!"
        else:
            senha_final = senha_raw or "123456"
            cur = conn.execute(
                """
                INSERT INTO usuarios (nome, email, senha_hash, perfil, cargo, turno, telefone, salario_base)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (nome, email, hash_password(senha_final), perfil, cargo, turno, telefone, salario_base),
            )
            conn.commit()
            usuario_id = cur.lastrowid
            msg = "Colaborador cadastrado com sucesso!"
    except Exception as e:
        conn.close()
        raise APIError(f"Erro ao salvar colaborador (verifique se o login já existe): {str(e)}")
    conn.close()
    return {"id": usuario_id, "mensagem": msg}


def handle_delete_usuario(usuario_id: int):
    conn = get_connection()
    total_ativos = conn.execute("SELECT COUNT(*) as c FROM usuarios WHERE ativo = 1").fetchone()["c"]
    if total_ativos <= 1:
        conn.close()
        raise APIError("Não é possível remover o único usuário ativo do sistema.")
    conn.execute("UPDATE usuarios SET ativo = 0 WHERE id = ?", (usuario_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Colaborador removido da equipe ativa."}


# ==========================================
# DASHBOARD EXECUTIVO (EXCLUSIVO ADMIN)
# ==========================================

def handle_dashboard():
    hoje = datetime.now().strftime("%Y-%m-%d")
    mes_atual = datetime.now().strftime("%Y-%m")

    conn = get_connection()

    # Vendas de hoje
    vendas_hoje = rows_to_list(
        conn.execute(
            """
            SELECT v.*, c.nome as cliente_nome, u.nome as funcionario_nome
            FROM vendas v
            LEFT JOIN clientes c ON c.id = v.cliente_id
            LEFT JOIN usuarios u ON u.id = v.funcionario_id
            WHERE v.data_venda = ? AND v.status != 'Cancelada'
            ORDER BY v.id DESC
            """,
            (hoje,),
        ).fetchall()
    )
    faturamento_hoje = sum(v["valor_total"] for v in vendas_hoje)
    sorvetes_hoje = sum(v["quantidade_sorvetes"] or 1 for v in vendas_hoje)

    # Vendas no mês
    vendas_mes_count = conn.execute(
        "SELECT COUNT(*) as c, COALESCE(SUM(quantidade_sorvetes), 0) as sorvetes FROM vendas WHERE substr(data_venda, 1, 7) = ? AND status != 'Cancelada'",
        (mes_atual,),
    ).fetchone()

    # Clientes ativos e alertas de estoque
    total_clientes = conn.execute("SELECT COUNT(*) as c FROM clientes WHERE status != 'Inativo'").fetchone()["c"]
    estoque_baixo = rows_to_list(
        conn.execute(
            """
            SELECT * FROM estoque
            WHERE quantidade_atual <= quantidade_minima
            ORDER BY (quantidade_atual / CASE WHEN quantidade_minima > 0 THEN quantidade_minima ELSE 1 END) ASC
            """
        ).fetchall()
    )

    # Resumo financeiro do mês
    fin_resumo = row_to_dict(
        conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'Receita' AND status_pagamento = 'Pago' THEN valor ELSE 0 END), 0) as receitas_pagas,
                COALESCE(SUM(CASE WHEN status_pagamento = 'Pendente' THEN valor ELSE 0 END), 0) as pendentes_total,
                COALESCE(SUM(CASE WHEN tipo = 'Receita' AND status_pagamento = 'Pendente' THEN valor ELSE 0 END), 0) as receitas_pendentes,
                COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND status_pagamento = 'Pago' THEN valor ELSE 0 END), 0) as despesas_pagas,
                COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND status_pagamento = 'Pendente' THEN valor ELSE 0 END), 0) as despesas_pendentes,
                COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) as despesas_total
            FROM financeiro
            WHERE substr(data_vencimento, 1, 7) = ?
            """,
            (mes_atual,),
        ).fetchone()
    )
    fin_resumo["saldo_liquido"] = fin_resumo["receitas_pagas"] - fin_resumo["despesas_pagas"]

    # Pendências financeiras
    pendencias = rows_to_list(
        conn.execute(
            """
            SELECT f.*, c.nome as cliente_nome
            FROM financeiro f
            LEFT JOIN clientes c ON c.id = f.cliente_id
            WHERE f.status_pagamento = 'Pendente'
            ORDER BY f.data_vencimento ASC LIMIT 8
            """
        ).fetchall()
    )

    # Despesas da Sorveteria
    despesas_sorveteria = rows_to_list(
        conn.execute(
            """
            SELECT f.*, u.nome as funcionario_nome
            FROM financeiro f
            LEFT JOIN usuarios u ON u.id = f.funcionario_id
            WHERE f.tipo = 'Despesa'
            ORDER BY f.data_vencimento DESC, f.id DESC LIMIT 8
            """
        ).fetchall()
    )

    conn.close()
    return {
        "hoje": hoje,
        "mes_atual": mes_atual,
        "faturamento_hoje": faturamento_hoje,
        "pedidos_hoje": len(vendas_hoje),
        "sorvetes_hoje": sorvetes_hoje,
        "pedidos_mes": vendas_mes_count["c"],
        "sorvetes_mes": vendas_mes_count["sorvetes"],
        "total_clientes": total_clientes,
        "total_estoque_baixo": len(estoque_baixo),
        "estoque_baixo": estoque_baixo,
        "vendas_hoje": vendas_hoje,
        "financeiro_mes": fin_resumo,
        "pendencias_financeiras": pendencias,
        "despesas_sorveteria": despesas_sorveteria,
    }


# ==========================================
# CARDÁPIO DE PRODUTOS E SABORES
# ==========================================

def handle_get_produtos(query: dict):
    categoria = (query.get("categoria") or "").strip()
    busca = (query.get("busca") or "").strip()
    apenas_disponiveis = query.get("disponivel")

    sql = "SELECT * FROM produtos WHERE 1=1"
    params = []
    if categoria:
        sql += " AND categoria = ?"
        params.append(categoria)
    if busca:
        sql += " AND (nome LIKE ? OR sabor_detalhe LIKE ? OR categoria LIKE ?)"
        params.extend([f"%{busca}%", f"%{busca}%", f"%{busca}%"])
    if apenas_disponiveis == "1":
        sql += " AND disponivel = 1"

    sql += " ORDER BY destaque DESC, categoria ASC, nome ASC"
    conn = get_connection()
    rows = rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    return rows


def handle_save_produto(body: dict, prod_id: int = None):
    nome = (body.get("nome") or "").strip()
    categoria = (body.get("categoria") or "Casquinha / Cascão").strip()
    sabor_detalhe = (body.get("sabor_detalhe") or "").strip()
    preco = float(body.get("preco") or 0)
    custo_unitario = float(body.get("custo_unitario") or 0)
    disponivel = 1 if body.get("disponivel", True) in (True, 1, "1", "true") else 0
    destaque = 1 if body.get("destaque", False) in (True, 1, "1", "true") else 0

    if not nome or preco <= 0:
        raise APIError("Nome do produto e preço maior que zero são obrigatórios.")

    conn = get_connection()
    if prod_id:
        conn.execute(
            """
            UPDATE produtos SET
                nome = ?, categoria = ?, sabor_detalhe = ?, preco = ?,
                custo_unitario = ?, disponivel = ?, destaque = ?
            WHERE id = ?
            """,
            (nome, categoria, sabor_detalhe, preco, custo_unitario, disponivel, destaque, prod_id),
        )
        msg = "Item do cardápio atualizado!"
    else:
        cur = conn.execute(
            """
            INSERT INTO produtos (nome, categoria, sabor_detalhe, preco, custo_unitario, disponivel, destaque)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (nome, categoria, sabor_detalhe, preco, custo_unitario, disponivel, destaque),
        )
        prod_id = cur.lastrowid
        msg = "Novo sabor/produto adicionado ao cardápio!"
    conn.commit()
    conn.close()
    return {"id": prod_id, "mensagem": msg}


def handle_toggle_produto(prod_id: int, body: dict):
    disponivel = 1 if body.get("disponivel") in (True, 1, "1", "true") else 0
    conn = get_connection()
    conn.execute("UPDATE produtos SET disponivel = ? WHERE id = ?", (disponivel, prod_id))
    conn.commit()
    conn.close()
    status_txt = "Disponível no balcão" if disponivel else "Esgotado temporariamente"
    return {"mensagem": f"Status alterado para: {status_txt}"}


def handle_delete_produto(prod_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM produtos WHERE id = ?", (prod_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Produto removido do cardápio."}


# ==========================================
# CONTROLE DE ESTOQUE & INSUMOS
# ==========================================

def handle_get_estoque(query: dict):
    categoria = (query.get("categoria") or "").strip()
    alerta = query.get("alerta")

    sql = "SELECT * FROM estoque WHERE 1=1"
    params = []
    if categoria:
        sql += " AND categoria = ?"
        params.append(categoria)
    if alerta == "baixo":
        sql += " AND quantidade_atual <= quantidade_minima"

    sql += " ORDER BY CASE WHEN quantidade_atual <= quantidade_minima THEN 0 ELSE 1 END, item ASC"
    conn = get_connection()
    rows = rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    return rows


def handle_save_estoque(body: dict, est_id: int = None):
    item = (body.get("item") or "").strip()
    categoria = (body.get("categoria") or "Bases & Laticínios").strip()
    unidade = (body.get("unidade") or "un").strip()
    quantidade_atual = float(body.get("quantidade_atual") or 0)
    quantidade_minima = float(body.get("quantidade_minima") or 5)
    custo_reposicao = float(body.get("custo_reposicao") or 0)
    fornecedor = (body.get("fornecedor") or "").strip()
    agora = datetime.now().strftime("%Y-%m-%d %H:%M")

    if not item:
        raise APIError("O nome do insumo/item de estoque é obrigatório.")

    conn = get_connection()
    if est_id:
        conn.execute(
            """
            UPDATE estoque SET
                item = ?, categoria = ?, unidade = ?, quantidade_atual = ?,
                quantidade_minima = ?, custo_reposicao = ?, fornecedor = ?, atualizado_em = ?
            WHERE id = ?
            """,
            (item, categoria, unidade, quantidade_atual, quantidade_minima, custo_reposicao, fornecedor, agora, est_id),
        )
        msg = "Item de estoque atualizado!"
    else:
        cur = conn.execute(
            """
            INSERT INTO estoque (item, categoria, unidade, quantidade_atual, quantidade_minima, custo_reposicao, fornecedor, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (item, categoria, unidade, quantidade_atual, quantidade_minima, custo_reposicao, fornecedor, agora),
        )
        est_id = cur.lastrowid
        msg = "Insumo cadastrado no estoque!"
    conn.commit()
    conn.close()
    return {"id": est_id, "mensagem": msg}


def handle_movimentar_estoque(est_id: int, body: dict):
    operacao = body.get("operacao") or "entrada"  # entrada ou baixa
    qtd = float(body.get("quantidade") or 0)
    if qtd <= 0:
        raise APIError("Informe uma quantidade maior que zero.")

    conn = get_connection()
    atual = conn.execute("SELECT item, quantidade_atual, unidade FROM estoque WHERE id = ?", (est_id,)).fetchone()
    if not atual:
        conn.close()
        raise APIError("Item de estoque não encontrado.", 404)

    nova_qtd = atual["quantidade_atual"] + qtd if operacao == "entrada" else max(0.0, atual["quantidade_atual"] - qtd)
    agora = datetime.now().strftime("%Y-%m-%d %H:%M")
    conn.execute(
        "UPDATE estoque SET quantidade_atual = ?, atualizado_em = ? WHERE id = ?",
        (round(nova_qtd, 2), agora, est_id),
    )
    conn.commit()
    conn.close()
    acao_str = "adicionada ao" if operacao == "entrada" else "baixada do"
    return {"mensagem": f"Quantidade ({qtd} {atual['unidade']}) {acao_str} estoque de '{atual['item']}'!"}


def handle_delete_estoque(est_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM estoque WHERE id = ?", (est_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Item removido do controle de estoque."}


# ==========================================
# CLIENTES E PROGRAMA FIDELIDADE (10 = 1 GRÁTIS)
# ==========================================

def handle_get_clientes(query: dict):
    busca = (query.get("busca") or "").strip()
    status = (query.get("status") or "").strip()

    sql = "SELECT * FROM clientes WHERE 1=1"
    params = []
    if busca:
        sql += " AND (nome LIKE ? OR cpf LIKE ? OR telefone LIKE ? OR sabor_favorito LIKE ?)"
        params.extend([f"%{busca}%", f"%{busca}%", f"%{busca}%", f"%{busca}%"])
    if status:
        sql += " AND status = ?"
        params.append(status)

    sql += " ORDER BY pontos_fidelidade DESC, nome ASC"
    conn = get_connection()
    rows = rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    return rows


def handle_save_cliente(body: dict, cliente_id: int = None):
    nome = (body.get("nome") or "").strip()
    if not nome:
        raise APIError("O nome do cliente é obrigatório.")

    cpf = (body.get("cpf") or "").strip() or None
    telefone = (body.get("telefone") or "").strip()
    sabor_favorito = (body.get("sabor_favorito") or "").strip()
    pontos = int(body.get("pontos_fidelidade") or 0)
    status = body.get("status") or "Ativo"
    observacoes = (body.get("observacoes") or "").strip()

    conn = get_connection()
    try:
        if cliente_id:
            conn.execute(
                """
                UPDATE clientes SET
                    nome = ?, cpf = ?, telefone = ?, sabor_favorito = ?,
                    pontos_fidelidade = ?, status = ?, observacoes = ?
                WHERE id = ?
                """,
                (nome, cpf, telefone, sabor_favorito, pontos, status, observacoes, cliente_id),
            )
            msg = "Cadastro do cliente atualizado!"
        else:
            cur = conn.execute(
                """
                INSERT INTO clientes (nome, cpf, telefone, sabor_favorito, pontos_fidelidade, status, observacoes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (nome, cpf, telefone, sabor_favorito, pontos, status, observacoes),
            )
            cliente_id = cur.lastrowid
            msg = "Cliente cadastrado no Programa Fidelidade Cone Mágico!"
        conn.commit()
    except Exception as e:
        conn.close()
        raise APIError(f"Erro ao salvar cliente (verifique se o CPF já está cadastrado): {str(e)}")
    conn.close()
    return {"id": cliente_id, "mensagem": msg}


def handle_resgatar_fidelidade(cliente_id: int):
    conn = get_connection()
    cli = conn.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
    if not cli:
        conn.close()
        raise APIError("Cliente não encontrado.", 404)
    if cli["pontos_fidelidade"] < 10:
        conn.close()
        raise APIError(
            f"O cliente possui {cli['pontos_fidelidade']} selos. São necessários 10 selos para resgatar 1 sorvete grátis!"
        )
    novos_pontos = cli["pontos_fidelidade"] - 10
    novos_premios = (cli["premios_resgatados"] or 0) + 1
    conn.execute(
        "UPDATE clientes SET pontos_fidelidade = ?, premios_resgatados = ?, status = 'VIP' WHERE id = ?",
        (novos_pontos, novos_premios, cliente_id),
    )
    conn.commit()
    conn.close()
    return {
        "mensagem": f"🎉 Prêmio Fidelidade resgatado para {cli['nome']}! (Saldo restante: {novos_pontos} selos)"
    }


def handle_delete_cliente(cliente_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Cliente removido com sucesso."}


# ==========================================
# PDV / FRENTE DE CAIXA E PEDIDOS
# ==========================================

def handle_get_vendas(query: dict):
    data_inicio = query.get("data_inicio")
    data_fim = query.get("data_fim")
    forma_pagamento = query.get("forma_pagamento")
    status = query.get("status")

    sql = """
        SELECT v.*, COALESCE(c.nome, v.cliente_nome_avulso) as cliente_nome,
               COALESCE(c.telefone, v.cliente_telefone) as cliente_telefone,
               c.cpf as cliente_cpf,
               u.nome as funcionario_nome
        FROM vendas v
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN usuarios u ON u.id = v.funcionario_id
        WHERE 1=1
    """
    params = []
    if data_inicio:
        sql += " AND v.data_venda >= ?"
        params.append(data_inicio)
    if data_fim:
        sql += " AND v.data_venda <= ?"
        params.append(data_fim)
    if forma_pagamento:
        sql += " AND v.forma_pagamento = ?"
        params.append(forma_pagamento)
    if status:
        sql += " AND v.status = ?"
        params.append(status)

    sql += " ORDER BY v.data_venda DESC, v.hora_venda DESC, v.id DESC"
    conn = get_connection()
    rows = rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()
    return rows


def handle_create_venda(body: dict, headers: dict):
    user = require_auth(headers)
    itens = body.get("itens") or []
    if not itens:
        raise APIError("Adicione pelo menos 1 item da sorveteria ao pedido antes de finalizar.")

    cliente_id = int(body["cliente_id"]) if body.get("cliente_id") else None
    desconto = float(body.get("desconto") or 0.0)
    forma_pagamento = body.get("forma_pagamento") or "PIX"
    tipo_atendimento = body.get("tipo_atendimento") or "Balcão"
    observacoes = (body.get("observacoes") or "").strip()

    subtotal = 0.0
    qtd_sorvetes = 0
    resumo_parts = []
    itens_clean = []

    for it in itens:
        q = int(it.get("qtd") or 1)
        preco = float(it.get("preco") or 0.0)
        nome_prod = it.get("nome") or "Item"
        sub = round(q * preco, 2)
        subtotal += sub
        qtd_sorvetes += q
        resumo_parts.append(f"{q}x {nome_prod}")
        itens_clean.append(
            {
                "produto_id": it.get("produto_id"),
                "nome": nome_prod,
                "qtd": q,
                "preco": preco,
                "subtotal": sub,
            }
        )

    valor_total = max(0.0, round(subtotal - desconto, 2))
    if forma_pagamento == "Fidelidade / Prêmio":
        valor_total = 0.0

    agora = datetime.now()
    data_venda = body.get("data_venda") or agora.strftime("%Y-%m-%d")
    hora_venda = body.get("hora_venda") or agora.strftime("%H:%M")
    itens_resumo = ", ".join(resumo_parts)

    conn = get_connection()

    # Gerar código de pedido sequencial amigável
    ultimo_id = conn.execute("SELECT COALESCE(MAX(id), 0) as m FROM vendas").fetchone()["m"]
    codigo_pedido = f"CM-{1001 + ultimo_id}"

    cur = conn.execute(
        """
        INSERT INTO vendas (
            codigo_pedido, cliente_id, funcionario_id, data_venda, hora_venda,
            itens_resumo, itens_json, quantidade_sorvetes, subtotal, desconto,
            valor_total, forma_pagamento, tipo_atendimento, status, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Concluída', ?)
        """,
        (
            codigo_pedido,
            cliente_id,
            user["id"],
            data_venda,
            hora_venda,
            itens_resumo,
            json.dumps(itens_clean, ensure_ascii=False),
            qtd_sorvetes,
            subtotal,
            desconto,
            valor_total,
            forma_pagamento,
            tipo_atendimento,
            observacoes,
        ),
    )
    venda_id = cur.lastrowid

    # Atualizar pontos de fidelidade do cliente
    msg_fidelidade = ""
    if cliente_id:
        cli = conn.execute("SELECT nome, pontos_fidelidade, premios_resgatados, total_compras FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
        if cli:
            if forma_pagamento == "Fidelidade / Prêmio":
                novos_pts = max(0, (cli["pontos_fidelidade"] or 0) - 10)
                novos_premios = (cli["premios_resgatados"] or 0) + 1
                conn.execute(
                    "UPDATE clientes SET pontos_fidelidade = ?, premios_resgatados = ? WHERE id = ?",
                    (novos_pts, novos_premios, cliente_id),
                )
                msg_fidelidade = f" • Prêmio Fidelidade resgatado para {cli['nome']}!"
            else:
                novos_pts = (cli["pontos_fidelidade"] or 0) + qtd_sorvetes
                novo_total = round((cli["total_compras"] or 0.0) + valor_total, 2)
                novo_status = "VIP" if novos_pts >= 10 or novo_total >= 150 else "Ativo"
                conn.execute(
                    "UPDATE clientes SET pontos_fidelidade = ?, total_compras = ?, status = ? WHERE id = ?",
                    (novos_pts, novo_total, novo_status, cliente_id),
                )
                msg_fidelidade = f" • +{qtd_sorvetes} selo(s) fidelidade ({novos_pts}/10)!"

    # Gerar lançamento automático de Receita no Financeiro (se valor > 0)
    if valor_total > 0:
        conn.execute(
            """
            INSERT INTO financeiro (
                tipo, categoria, descricao, cliente_id, funcionario_id, venda_id,
                valor, data_vencimento, data_pagamento, status_pagamento,
                forma_pagamento, origem_caixa, observacoes
            ) VALUES ('Receita', 'Venda PDV', ?, ?, ?, ?, ?, ?, ?, 'Pago', ?, 'PDV', ?)
            """,
            (
                f"Pedido #{codigo_pedido} — {itens_resumo[:90]}",
                cliente_id,
                user["id"],
                venda_id,
                valor_total,
                data_venda,
                data_venda,
                forma_pagamento,
                observacoes,
            ),
        )

    conn.commit()
    venda_criada = row_to_dict(
        conn.execute(
            """
            SELECT v.*, c.nome as cliente_nome, c.cpf as cliente_cpf, u.nome as funcionario_nome
            FROM vendas v
            LEFT JOIN clientes c ON c.id = v.cliente_id
            LEFT JOIN usuarios u ON u.id = v.funcionario_id
            WHERE v.id = ?
            """,
            (venda_id,),
        ).fetchone()
    )
    conn.close()

    return {
        "id": venda_id,
        "codigo_pedido": codigo_pedido,
        "venda": venda_criada,
        "mensagem": f"Venda #{codigo_pedido} concluída com sucesso!{msg_fidelidade}",
    }


def handle_cancel_venda(venda_id: int):
    conn = get_connection()
    conn.execute("UPDATE vendas SET status = 'Cancelada', status_delivery = 'Cancelado' WHERE id = ?", (venda_id,))
    conn.execute("DELETE FROM financeiro WHERE venda_id = ?", (venda_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Pedido cancelado e estornado do caixa."}


# ==========================================
# CARDÁPIO DIGITAL ONLINE (/pedir) & CENTRAL DE DELIVERY (99ENTREGA / MOTOBOY)
# Taxa Zero (0% Comissão) — Integrado direto ao Caixa e Fidelidade
# ==========================================

def handle_public_cardapio():
    conn = get_connection()
    produtos = rows_to_list(
        conn.execute(
            """
            SELECT id, nome, categoria, sabor_detalhe, preco, disponivel, destaque
            FROM produtos
            WHERE disponivel = 1
            ORDER BY CASE
                WHEN categoria = 'Casquinha / Cascão' THEN 1
                WHEN categoria = 'Copo / Sundae' THEN 2
                WHEN categoria = 'Taças Especiais' THEN 3
                WHEN categoria = 'Milkshake' THEN 4
                WHEN categoria = 'Picolé' THEN 5
                WHEN categoria = 'Pote / Viagem' THEN 6
                ELSE 7
            END, destaque DESC, nome ASC
            """
        ).fetchall()
    )
    conn.close()
    return {
        "loja": "Sorveteria Cone Mágico",
        "taxa_entrega_padrao": 6.00,
        "tempo_estimado": "25 a 40 min",
        "produtos": produtos,
    }


def handle_public_criar_pedido(body: dict):
    nome = (body.get("nome") or "").strip()
    telefone = (body.get("telefone") or "").strip()
    modalidade = (body.get("modalidade_entrega") or "99Entrega / Motoboy").strip()
    endereco = (body.get("endereco_entrega") or "").strip()
    forma_pagamento = (body.get("forma_pagamento") or "PIX").strip()
    troco_para = float(body.get("troco_para") or 0.0)
    observacoes = (body.get("observacoes") or "").strip()
    itens = body.get("itens") or []

    if not nome or not telefone:
        raise APIError("Informe seu Nome e WhatsApp para realizar o pedido.")
    if not itens:
        raise APIError("Seu carrinho está vazio! Escolha pelo menos 1 item do cardápio.")
    if modalidade != "Retirada no Balcão" and not endereco:
        raise APIError("Informe o endereço completo (Rua, Número, Bairro) para a entrega.")

    subtotal = 0.0
    qtd_sorvetes = 0
    resumo_parts = []
    itens_clean = []

    for it in itens:
        q = int(it.get("qtd") or 1)
        if q <= 0:
            continue
        preco = float(it.get("preco") or 0.0)
        nome_prod = it.get("nome") or "Sorvete"
        sub = round(q * preco, 2)
        subtotal += sub
        qtd_sorvetes += q
        resumo_parts.append(f"{q}x {nome_prod}")
        itens_clean.append(
            {
                "produto_id": it.get("produto_id"),
                "nome": nome_prod,
                "qtd": q,
                "preco": preco,
                "subtotal": sub,
            }
        )

    taxa_entrega = 0.0 if modalidade == "Retirada no Balcão" else float(body.get("taxa_entrega", 6.00))
    valor_total = round(subtotal + taxa_entrega, 2)
    itens_resumo = ", ".join(resumo_parts)

    agora = datetime.now()
    data_venda = agora.strftime("%Y-%m-%d")
    hora_venda = agora.strftime("%H:%M")

    conn = get_connection()
    ensure_default_users(conn)

    # Vincular ou cadastrar cliente automaticamente pelo telefone para pontuar no Fidelidade!
    tel_digits = re.sub(r"\D", "", telefone)
    cli_row = None
    if tel_digits:
        todos_cli = rows_to_list(conn.execute("SELECT * FROM clientes").fetchall())
        for c in todos_cli:
            c_digits = re.sub(r"\D", "", c.get("telefone") or "")
            if c_digits and c_digits == tel_digits:
                cli_row = c
                break

    if cli_row:
        cliente_id = cli_row["id"]
        novos_pts = (cli_row.get("pontos_fidelidade") or 0) + qtd_sorvetes
        novo_total = round((cli_row.get("total_compras") or 0.0) + valor_total, 2)
        novo_status = "VIP" if novos_pts >= 10 or novo_total >= 150 else "Ativo"
        conn.execute(
            """
            UPDATE clientes SET
                pontos_fidelidade = ?, total_compras = ?, status = ?,
                observacoes = COALESCE(observacoes, ?)
            WHERE id = ?
            """,
            (novos_pts, novo_total, novo_status, f"Endereço Delivery: {endereco}" if endereco else "", cliente_id),
        )
    else:
        novo_status = "VIP" if qtd_sorvetes >= 10 or valor_total >= 150 else "Ativo"
        cur_cli = conn.execute(
            """
            INSERT INTO clientes (nome, cpf, telefone, sabor_favorito, pontos_fidelidade, premios_resgatados, total_compras, status, observacoes)
            VALUES (?, NULL, ?, ?, ?, 0, ?, ?, ?)
            """,
            (
                nome,
                telefone,
                itens_clean[0]["nome"] if itens_clean else "Sorvete",
                qtd_sorvetes,
                valor_total,
                novo_status,
                f"Cadastrado pelo Cardápio Digital (/pedir). Endereço: {endereco}" if endereco else "Cadastrado pelo Cardápio Digital (/pedir)",
            ),
        )
        cliente_id = cur_cli.lastrowid
        novos_pts = qtd_sorvetes

    # Atendente padrão para vínculo inicial do pedido online
    op_row = conn.execute("SELECT id FROM usuarios WHERE ativo = 1 ORDER BY CASE WHEN perfil = 'funcionario' THEN 0 ELSE 1 END LIMIT 1").fetchone()
    funcionario_id = op_row["id"] if op_row else 1

    ultimo_id = conn.execute("SELECT COALESCE(MAX(id), 0) as m FROM vendas").fetchone()["m"]
    codigo_pedido = f"DEL-{2001 + ultimo_id}"
    tipo_atendimento = "Retirada Online" if modalidade == "Retirada no Balcão" else "Delivery Online"

    cur = conn.execute(
        """
        INSERT INTO vendas (
            codigo_pedido, cliente_id, funcionario_id, data_venda, hora_venda,
            itens_resumo, itens_json, quantidade_sorvetes, subtotal, desconto,
            valor_total, forma_pagamento, tipo_atendimento, status, observacoes,
            endereco_entrega, taxa_entrega, troco_para, modalidade_entrega,
            status_delivery, entregador_info, cliente_telefone, cliente_nome_avulso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, 'Em Preparo', ?, ?, ?, ?, ?, 'Novo / Recebido', '', ?, ?)
        """,
        (
            codigo_pedido,
            cliente_id,
            funcionario_id,
            data_venda,
            hora_venda,
            itens_resumo,
            json.dumps(itens_clean, ensure_ascii=False),
            qtd_sorvetes,
            subtotal,
            valor_total,
            forma_pagamento,
            tipo_atendimento,
            observacoes,
            endereco if modalidade != "Retirada no Balcão" else "Retirada no Balcão da Sorveteria",
            taxa_entrega,
            troco_para,
            modalidade,
            telefone,
            nome,
        ),
    )
    venda_id = cur.lastrowid

    # Lançar no Financeiro como Receita de Delivery / App (Taxa Zero)
    status_fin = "Pago" if forma_pagamento == "PIX" else "Pendente"
    data_pag_fin = data_venda if status_fin == "Pago" else None
    obs_fin = f"Cliente: {nome} ({telefone}) • {modalidade}" + (f" • End: {endereco}" if endereco else "")
    conn.execute(
        """
        INSERT INTO financeiro (
            tipo, categoria, descricao, cliente_id, funcionario_id, venda_id,
            valor, data_vencimento, data_pagamento, status_pagamento,
            forma_pagamento, origem_caixa, observacoes
        ) VALUES ('Receita', 'Delivery / App', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cardápio Online', ?)
        """,
        (
            f"Pedido Online #{codigo_pedido} — {itens_resumo[:85]}",
            cliente_id,
            funcionario_id,
            venda_id,
            valor_total,
            data_venda,
            data_pag_fin,
            status_fin,
            forma_pagamento,
            obs_fin,
        ),
    )

    conn.commit()
    conn.close()

    return {
        "id": venda_id,
        "codigo_pedido": codigo_pedido,
        "valor_total": valor_total,
        "subtotal": subtotal,
        "taxa_entrega": taxa_entrega,
        "status_delivery": "Novo / Recebido",
        "pontos_fidelidade": novos_pts,
        "mensagem": f"Pedido #{codigo_pedido} enviado para a Sorveteria Cone Mágico! Você acumulou +{qtd_sorvetes} selo(s) no Cartão Fidelidade ({novos_pts}/10)!",
    }


def handle_public_consultar_pedido(codigo: str):
    conn = get_connection()
    row = conn.execute(
        """
        SELECT v.id, v.codigo_pedido, v.data_venda, v.hora_venda, v.itens_resumo, v.itens_json,
               v.subtotal, v.taxa_entrega, v.valor_total, v.forma_pagamento, v.troco_para,
               v.modalidade_entrega, v.endereco_entrega, v.status, v.status_delivery,
               v.entregador_info, v.link_rastreio_99, v.motoboy_lat, v.motoboy_lng, v.motoboy_atualizado_em,
               COALESCE(v.loja_lat, -23.55052) as loja_lat, COALESCE(v.loja_lng, -46.633308) as loja_lng,
               v.observacoes,
               COALESCE(c.nome, v.cliente_nome_avulso) as cliente_nome,
               COALESCE(c.telefone, v.cliente_telefone) as cliente_telefone,
               COALESCE(c.pontos_fidelidade, 0) as pontos_fidelidade
        FROM vendas v
        LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE upper(v.codigo_pedido) = ?
        """,
        (codigo.strip().upper(),),
    ).fetchone()
    conn.close()
    if not row:
        raise APIError("Pedido não encontrado.", 404)
    return row_to_dict(row)


def handle_get_delivery(query: dict, headers: dict):
    require_auth(headers)
    status_filtro = query.get("status_delivery") or ""
    hoje = datetime.now().strftime("%Y-%m-%d")

    conn = get_connection()
    rows = rows_to_list(
        conn.execute(
            """
            SELECT v.*, COALESCE(c.nome, v.cliente_nome_avulso) as cliente_nome,
                   COALESCE(c.telefone, v.cliente_telefone) as cliente_telefone,
                   COALESCE(c.pontos_fidelidade, 0) as pontos_fidelidade,
                   u.nome as funcionario_nome
            FROM vendas v
            LEFT JOIN clientes c ON c.id = v.cliente_id
            LEFT JOIN usuarios u ON u.id = v.funcionario_id
            WHERE (v.codigo_pedido LIKE 'DEL-%' OR v.tipo_atendimento IN ('Delivery', 'Delivery Online', 'Retirada Online'))
            ORDER BY
                CASE
                    WHEN v.status_delivery = 'Novo / Recebido' THEN 1
                    WHEN v.status_delivery = 'Em Preparo' THEN 2
                    WHEN v.status_delivery LIKE 'Saiu p/ Entrega%' THEN 3
                    WHEN v.status_delivery = 'Entregue' THEN 4
                    ELSE 5
                END ASC,
                v.id DESC
            """
        ).fetchall()
    )
    conn.close()

    novos = sum(1 for r in rows if (r.get("status_delivery") or "Novo / Recebido") == "Novo / Recebido" and r.get("status") != "Cancelada")
    em_preparo = sum(1 for r in rows if r.get("status_delivery") == "Em Preparo" and r.get("status") != "Cancelada")
    em_rota = sum(1 for r in rows if (r.get("status_delivery") or "").startswith("Saiu p/ Entrega") and r.get("status") != "Cancelada")
    entregues_hoje = sum(1 for r in rows if (r.get("status_delivery") in ("Entregue", "Concluído")) and r.get("data_venda") == hoje and r.get("status") != "Cancelada")
    faturamento_hoje = sum(float(r.get("valor_total") or 0) for r in rows if r.get("data_venda") == hoje and r.get("status") != "Cancelada")

    filtrados = rows
    if status_filtro:
        filtrados = [r for r in rows if (r.get("status_delivery") or "") == status_filtro]

    return {
        "kpis": {
            "novos": novos,
            "em_preparo": em_preparo,
            "em_rota": em_rota,
            "pendentes_total": novos + em_preparo + em_rota,
            "entregues_hoje": entregues_hoje,
            "faturamento_hoje": faturamento_hoje,
        },
        "pedidos": filtrados,
    }


def handle_update_delivery_status(venda_id: int, body: dict, headers: dict):
    user = require_auth(headers)
    novo_status_del = (body.get("status_delivery") or "Em Preparo").strip()
    entregador_info = (body.get("entregador_info") or "").strip()
    link_rastreio_99 = (body.get("link_rastreio_99") or "").strip()
    hoje = datetime.now().strftime("%Y-%m-%d")

    conn = get_connection()
    venda = conn.execute("SELECT * FROM vendas WHERE id = ?", (venda_id,)).fetchone()
    if not venda:
        conn.close()
        raise APIError("Pedido de delivery não encontrado.", 404)

    status_venda = venda["status"]
    if novo_status_del == "Entregue":
        status_venda = "Concluída"
    elif novo_status_del == "Cancelado":
        status_venda = "Cancelada"
    else:
        status_venda = "Em Preparo"

    info_final = entregador_info if entregador_info else (venda["entregador_info"] or "")
    link_final = link_rastreio_99 if link_rastreio_99 else (venda["link_rastreio_99"] or "")

    conn.execute(
        """
        UPDATE vendas SET
            status_delivery = ?, status = ?, entregador_info = ?, link_rastreio_99 = ?, funcionario_id = ?
        WHERE id = ?
        """,
        (novo_status_del, status_venda, info_final, link_final, user["id"], venda_id),
    )

    if novo_status_del == "Entregue":
        conn.execute(
            "UPDATE financeiro SET status_pagamento = 'Pago', data_pagamento = COALESCE(data_pagamento, ?) WHERE venda_id = ?",
            (hoje, venda_id),
        )
    elif novo_status_del == "Cancelado":
        conn.execute("DELETE FROM financeiro WHERE venda_id = ?", (venda_id,))

    conn.commit()
    conn.close()
    return {
        "id": venda_id,
        "status_delivery": novo_status_del,
        "link_rastreio_99": link_final,
        "mensagem": f"Status do pedido #{venda['codigo_pedido']} atualizado para '{novo_status_del}'!",
    }


def handle_update_motoboy_gps(codigo: str, body: dict):
    lat = float(body.get("lat") or 0.0)
    lng = float(body.get("lng") or 0.0)
    if not lat or not lng:
        raise APIError("Coordenadas de latitude e longitude são obrigatórias.")

    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entregador_info = (body.get("entregador_info") or "").strip()

    conn = get_connection()
    venda = conn.execute("SELECT id, codigo_pedido, entregador_info FROM vendas WHERE upper(codigo_pedido) = ?", (codigo.strip().upper(),)).fetchone()
    if not venda:
        conn.close()
        raise APIError("Pedido não encontrado.", 404)

    info_final = entregador_info if entregador_info else (venda["entregador_info"] or "Motoboy Conectado via GPS")
    conn.execute(
        """
        UPDATE vendas SET
            motoboy_lat = ?, motoboy_lng = ?, motoboy_atualizado_em = ?,
            entregador_info = ?, status_delivery = CASE WHEN status_delivery = 'Novo / Recebido' THEN 'Saiu p/ Entrega (99Entrega)' ELSE status_delivery END
        WHERE id = ?
        """,
        (lat, lng, agora, info_final, venda["id"]),
    )
    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "codigo_pedido": venda["codigo_pedido"],
        "lat": lat,
        "lng": lng,
        "atualizado_em": agora,
        "mensagem": "Localização do motoboy transmitida em tempo real!",
    }


def handle_motoboy_concluir_entrega(codigo: str):
    hoje = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    venda = conn.execute(
        "SELECT id, codigo_pedido FROM vendas WHERE upper(codigo_pedido) = ?",
        (codigo.strip().upper(),),
    ).fetchone()
    if not venda:
        conn.close()
        raise APIError("Pedido não encontrado.", 404)

    conn.execute(
        """
        UPDATE vendas SET
            status_delivery = 'Entregue',
            status = 'Concluída'
        WHERE id = ?
        """,
        (venda["id"],),
    )
    conn.execute(
        "UPDATE financeiro SET status_pagamento = 'Pago', data_pagamento = COALESCE(data_pagamento, ?) WHERE venda_id = ?",
        (hoje, venda["id"]),
    )
    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "mensagem": f"Pedido #{venda['codigo_pedido']} entregue com sucesso!",
        "status_delivery": "Entregue",
    }


# ==========================================
# CAIXA RÁPIDO DO FUNCIONÁRIO (SANGRIA / SUPRIMENTO / DESPESA DE BALCÃO)
# Sem expor relatórios de lucro nem balancete do Admin!
# ==========================================

def handle_get_caixa_rapido(headers: dict):
    require_auth(headers)
    hoje = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()

    movimentos = rows_to_list(
        conn.execute(
            """
            SELECT f.id, f.tipo, f.categoria, f.descricao, f.valor, f.forma_pagamento,
                   f.data_vencimento, f.observacoes, u.nome as funcionario_nome
            FROM financeiro f
            LEFT JOIN usuarios u ON u.id = f.funcionario_id
            WHERE f.origem_caixa = 'Caixa Rápido' OR (f.data_vencimento = ? AND f.categoria IN ('Sangria / Despesa Rápida de Caixa', 'Suprimento / Troco de Caixa'))
            ORDER BY f.id DESC LIMIT 20
            """,
            (hoje,),
        ).fetchall()
    )
    conn.close()
    return {"hoje": hoje, "movimentos": movimentos}


def handle_post_caixa_rapido(body: dict, headers: dict):
    user = require_auth(headers)
    natureza = body.get("natureza") or "Sangria"  # 'Sangria' (Despesa rápida) ou 'Suprimento' (Entrada de troco)
    descricao = (body.get("descricao") or "").strip()
    valor = float(body.get("valor") or 0.0)
    forma_pagamento = body.get("forma_pagamento") or "Dinheiro"
    observacoes = (body.get("observacoes") or "").strip()

    if not descricao or valor <= 0:
        raise APIError("Informe o motivo/descrição e um valor maior que zero.")

    hoje = datetime.now().strftime("%Y-%m-%d")
    if natureza == "Suprimento":
        tipo = "Receita"
        categoria = "Suprimento / Troco de Caixa"
    else:
        tipo = "Despesa"
        categoria = "Sangria / Despesa Rápida de Caixa"

    obs_final = f"Lançado no caixa por {user['nome']}" + (f" • {observacoes}" if observacoes else "")

    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO financeiro (
            tipo, categoria, descricao, cliente_id, funcionario_id, venda_id,
            valor, data_vencimento, data_pagamento, status_pagamento,
            forma_pagamento, origem_caixa, observacoes
        ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, 'Pago', ?, 'Caixa Rápido', ?)
        """,
        (tipo, categoria, descricao, user["id"], valor, hoje, hoje, forma_pagamento, obs_final),
    )
    conn.commit()
    novo_id = cur.lastrowid
    conn.close()
    return {
        "id": novo_id,
        "mensagem": f"{categoria} registrada no caixa com sucesso!",
    }


# ==========================================
# CONTROLE FINANCEIRO, BALANCETE E DESPESAS (EXCLUSIVO ADMIN)
# ==========================================

def handle_get_financeiro(query: dict):
    mes = query.get("mes")  # YYYY-MM
    tipo = query.get("tipo")
    categoria = query.get("categoria")
    status_pagamento = query.get("status_pagamento")
    cliente_id = query.get("cliente_id")

    conn = get_connection()
    sql = """
        SELECT f.*, c.nome as cliente_nome, c.cpf as cliente_cpf,
               u.nome as funcionario_nome
        FROM financeiro f
        LEFT JOIN clientes c ON c.id = f.cliente_id
        LEFT JOIN usuarios u ON u.id = f.funcionario_id
        WHERE 1=1
    """
    params = []
    if mes:
        sql += " AND substr(f.data_vencimento, 1, 7) = ?"
        params.append(mes)
    if tipo:
        sql += " AND f.tipo = ?"
        params.append(tipo)
    if categoria:
        sql += " AND f.categoria = ?"
        params.append(categoria)
    if status_pagamento:
        sql += " AND f.status_pagamento = ?"
        params.append(status_pagamento)
    if cliente_id:
        sql += " AND f.cliente_id = ?"
        params.append(cliente_id)

    sql += " ORDER BY f.data_vencimento DESC, f.id DESC"
    lancamentos = rows_to_list(conn.execute(sql, params).fetchall())
    conn.close()

    receitas_pagas = sum(
        x["valor"] for x in lancamentos if x["tipo"] == "Receita" and x["status_pagamento"] == "Pago"
    )
    receitas_a_receber = sum(
        x["valor"] for x in lancamentos if x["tipo"] == "Receita" and x["status_pagamento"] == "Pendente"
    )
    despesas_pendentes = sum(
        x["valor"] for x in lancamentos if x["tipo"] == "Despesa" and x["status_pagamento"] == "Pendente"
    )
    total_pendentes = receitas_a_receber + despesas_pendentes
    despesas_pagas = sum(
        x["valor"] for x in lancamentos if x["tipo"] == "Despesa" and x["status_pagamento"] == "Pago"
    )

    return {
        "resumo": {
            "receitas_pagas": receitas_pagas,
            "receitas_pendentes": total_pendentes,
            "receitas_a_receber": receitas_a_receber,
            "despesas_pendentes": despesas_pendentes,
            "despesas": despesas_pagas,
            "saldo_liquido": receitas_pagas - despesas_pagas,
        },
        "lancamentos": lancamentos,
    }


def handle_save_financeiro(body: dict, fin_id: int = None, headers: dict = None):
    user = get_current_user(headers or {})
    tipo = body.get("tipo") or "Receita"
    categoria = body.get("categoria") or ("Venda PDV" if tipo == "Receita" else "Despesas da Sorveteria")
    descricao = (body.get("descricao") or "").strip()
    valor = float(body.get("valor") or 0)
    data_vencimento = body.get("data_vencimento") or datetime.now().strftime("%Y-%m-%d")
    status_pagamento = body.get("status_pagamento") or "Pago"
    forma_pagamento = body.get("forma_pagamento") or "PIX"
    cliente_id = int(body["cliente_id"]) if body.get("cliente_id") else None
    funcionario_id = int(body["funcionario_id"]) if body.get("funcionario_id") else (user["id"] if user else None)

    if tipo == "Despesa":
        cliente_id = None

    observacoes = (body.get("observacoes") or "").strip()

    if not descricao or valor <= 0:
        raise APIError("Descrição e valor maior que zero são obrigatórios.")

    data_pagamento = body.get("data_pagamento")
    if status_pagamento == "Pago" and not data_pagamento:
        data_pagamento = datetime.now().strftime("%Y-%m-%d")
    elif status_pagamento != "Pago":
        data_pagamento = None

    conn = get_connection()
    if fin_id:
        conn.execute(
            """
            UPDATE financeiro SET
                tipo = ?, categoria = ?, descricao = ?, cliente_id = ?, funcionario_id = ?,
                valor = ?, data_vencimento = ?, data_pagamento = ?, status_pagamento = ?,
                forma_pagamento = ?, observacoes = ?
            WHERE id = ?
            """,
            (
                tipo,
                categoria,
                descricao,
                cliente_id,
                funcionario_id,
                valor,
                data_vencimento,
                data_pagamento,
                status_pagamento,
                forma_pagamento,
                observacoes,
                fin_id,
            ),
        )
        msg = "Lançamento financeiro atualizado!"
    else:
        cur = conn.execute(
            """
            INSERT INTO financeiro (
                tipo, categoria, descricao, cliente_id, funcionario_id,
                valor, data_vencimento, data_pagamento, status_pagamento,
                forma_pagamento, origem_caixa, observacoes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin', ?)
            """,
            (
                tipo,
                categoria,
                descricao,
                cliente_id,
                funcionario_id,
                valor,
                data_vencimento,
                data_pagamento,
                status_pagamento,
                forma_pagamento,
                observacoes,
            ),
        )
        fin_id = cur.lastrowid
        msg = "Lançamento financeiro registrado!"

    conn.commit()
    conn.close()
    return {"id": fin_id, "mensagem": msg}


def handle_quitar_financeiro(fin_id: int, body: dict):
    forma = body.get("forma_pagamento") or "PIX"
    hoje = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    conn.execute(
        "UPDATE financeiro SET status_pagamento = 'Pago', data_pagamento = ?, forma_pagamento = ? WHERE id = ?",
        (hoje, forma, fin_id),
    )
    conn.commit()
    conn.close()
    return {"mensagem": "Baixa financeira confirmada com sucesso!"}


def handle_delete_financeiro(fin_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM financeiro WHERE id = ?", (fin_id,))
    conn.commit()
    conn.close()
    return {"mensagem": "Lançamento financeiro excluído."}


# ==========================================
# ROTEADOR WSGI UNIVERSAL
# ==========================================

def dispatch_api(method: str, path: str, query: dict, body: dict, headers: dict):
    init_db()
    if path == "/api/status" and method == "GET":
        return {
            "status": "ok",
            "sistema": "Cone Mágico — Sorveteria & PDV",
            "banco_dados": "Turso Cloud (libSQL)" if is_turso_enabled() else "SQLite Local",
            "turso_ativo": is_turso_enabled(),
        }

    if path == "/api/login" and method == "POST":
        return handle_login(body)

    if path == "/api/dashboard" and method == "GET":
        require_admin(headers)
        return handle_dashboard()

    # Usuários / Equipe
    if path == "/api/usuarios" and method == "GET":
        return handle_get_usuarios()
    if path == "/api/usuarios" and method == "POST":
        require_admin(headers)
        uid_body = int(body["id"]) if body.get("id") else None
        return handle_save_usuario(body, uid_body)
    m_usr = re.match(r"^/api/usuarios/(\d+)$", path)
    if m_usr:
        require_admin(headers)
        uid = int(m_usr.group(1))
        if method in ("PUT", "POST"):
            return handle_save_usuario(body, uid)
        if method == "DELETE":
            return handle_delete_usuario(uid)

    # Cardápio / Produtos
    if path == "/api/produtos" and method == "GET":
        return handle_get_produtos(query)
    if path == "/api/produtos" and method == "POST":
        require_admin(headers)
        return handle_save_produto(body)
    m_prod = re.match(r"^/api/produtos/(\d+)$", path)
    if m_prod:
        pid = int(m_prod.group(1))
        if method == "PUT":
            require_admin(headers)
            return handle_save_produto(body, pid)
        if method == "DELETE":
            require_admin(headers)
            return handle_delete_produto(pid)
    m_prod_disp = re.match(r"^/api/produtos/(\d+)/disponibilidade$", path)
    if m_prod_disp and method == "PATCH":
        require_auth(headers)
        return handle_toggle_produto(int(m_prod_disp.group(1)), body)

    # Estoque & Insumos
    if path == "/api/estoque" and method == "GET":
        require_auth(headers)
        return handle_get_estoque(query)
    if path == "/api/estoque" and method == "POST":
        require_auth(headers)
        return handle_save_estoque(body)
    m_est = re.match(r"^/api/estoque/(\d+)$", path)
    if m_est:
        eid = int(m_est.group(1))
        if method == "PUT":
            require_auth(headers)
            return handle_save_estoque(body, eid)
        if method == "DELETE":
            require_admin(headers)
            return handle_delete_estoque(eid)
    m_est_mov = re.match(r"^/api/estoque/(\d+)/movimentar$", path)
    if m_est_mov and method == "PATCH":
        require_auth(headers)
        return handle_movimentar_estoque(int(m_est_mov.group(1)), body)

    # Clientes & Fidelidade
    if path == "/api/clientes" and method == "GET":
        require_auth(headers)
        return handle_get_clientes(query)
    if path == "/api/clientes" and method == "POST":
        require_auth(headers)
        return handle_save_cliente(body)
    m_cli = re.match(r"^/api/clientes/(\d+)$", path)
    if m_cli:
        cid = int(m_cli.group(1))
        if method == "PUT":
            require_auth(headers)
            return handle_save_cliente(body, cid)
        if method == "DELETE":
            require_admin(headers)
            return handle_delete_cliente(cid)
    m_cli_resg = re.match(r"^/api/clientes/(\d+)/resgatar$", path)
    if m_cli_resg and method == "POST":
        require_auth(headers)
        return handle_resgatar_fidelidade(int(m_cli_resg.group(1)))

    # PDV / Vendas
    if path == "/api/vendas" and method == "GET":
        require_auth(headers)
        return handle_get_vendas(query)
    if path == "/api/vendas" and method == "POST":
        return handle_create_venda(body, headers)
    m_ven = re.match(r"^/api/vendas/(\d+)$", path)
    if m_ven and method == "DELETE":
        require_auth(headers)
        return handle_cancel_venda(int(m_ven.group(1)))

    # Cardápio Digital Online (/pedir) — Rotas Públicas para Clientes (Taxa Zero)
    if path == "/api/public/cardapio" and method == "GET":
        return handle_public_cardapio()
    if path == "/api/public/pedido" and method == "POST":
        return handle_public_criar_pedido(body)
    m_pub_ped = re.match(r"^/api/public/pedido/([A-Za-z0-9\-]+)$", path)
    if m_pub_ped and method == "GET":
        return handle_public_consultar_pedido(m_pub_ped.group(1))
    m_pub_gps = re.match(r"^/api/public/pedido/([A-Za-z0-9\-]+)/gps$", path)
    if m_pub_gps and method in ("POST", "PATCH"):
        return handle_update_motoboy_gps(m_pub_gps.group(1), body)
    m_pub_entregue = re.match(r"^/api/public/pedido/([A-Za-z0-9\-]+)/entregue$", path)
    if m_pub_entregue and method in ("POST", "PATCH"):
        return handle_motoboy_concluir_entrega(m_pub_entregue.group(1))

    # Central de Delivery & 99Entrega (Funcionário e Admin)
    if path == "/api/delivery" and method == "GET":
        return handle_get_delivery(query, headers)
    m_del_st = re.match(r"^/api/delivery/(\d+)/status$", path)
    if m_del_st and method == "PATCH":
        return handle_update_delivery_status(int(m_del_st.group(1)), body, headers)

    # Caixa Rápido do Funcionário (Sangria / Suprimento de Balcão)
    if path == "/api/caixa-rapido" and method == "GET":
        return handle_get_caixa_rapido(headers)
    if path == "/api/caixa-rapido" and method == "POST":
        return handle_post_caixa_rapido(body, headers)

    # Financeiro Completo, Fluxo de Caixa, Balancete e Despesas Fixas (Exclusivo Admin)
    if path == "/api/financeiro" and method == "GET":
        require_admin(headers)
        return handle_get_financeiro(query)
    if path == "/api/financeiro" and method == "POST":
        require_admin(headers)
        return handle_save_financeiro(body, None, headers)
    m_fin = re.match(r"^/api/financeiro/(\d+)$", path)
    if m_fin:
        require_admin(headers)
        fid = int(m_fin.group(1))
        if method == "PUT":
            return handle_save_financeiro(body, fid, headers)
        if method == "DELETE":
            return handle_delete_financeiro(fid)
    m_fin_pay = re.match(r"^/api/financeiro/(\d+)/pagar$", path)
    if m_fin_pay and method == "PATCH":
        require_admin(headers)
        return handle_quitar_financeiro(int(m_fin_pay.group(1)), body)

    raise APIError(f"Rota não encontrada: {method} {path}", 404)


def wsgi_app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/")
    query_raw = parse_qs(environ.get("QUERY_STRING", ""))
    query = {k: v[0] for k, v in query_raw.items()}

    headers = {}
    for k, v in environ.items():
        if k.startswith("HTTP_"):
            h_name = k[5:].replace("_", "-").title()
            headers[h_name] = v

    no_cache = [("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")]

    # Servir página principal (Gestão & PDV)
    if path == "/" and method in ("GET", "HEAD"):
        index_path = os.path.join(BASE_DIR, "templates", "index.html")
        with open(index_path, "rb") as f:
            content = f.read()
        start_response(
            "200 OK",
            [("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(content)))] + no_cache,
        )
        return [] if method == "HEAD" else [content]

    # Servir Cardápio Digital Online Público (/pedir) para Clientes (Delivery & Retirada Taxa Zero)
    if path.rstrip("/") == "/pedir" and method in ("GET", "HEAD"):
        pedir_path = os.path.join(BASE_DIR, "templates", "pedir.html")
        with open(pedir_path, "rb") as f:
            content = f.read()
        start_response(
            "200 OK",
            [("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(content)))] + no_cache,
        )
        return [] if method == "HEAD" else [content]

    # Servir Portal do Entregador / Motoboy GPS (/entregador ou /rota)
    if path.rstrip("/") in ("/entregador", "/rota") and method in ("GET", "HEAD"):
        entregador_path = os.path.join(BASE_DIR, "templates", "entregador.html")
        with open(entregador_path, "rb") as f:
            content = f.read()
        start_response(
            "200 OK",
            [("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(content)))] + no_cache,
        )
        return [] if method == "HEAD" else [content]

    # Servir arquivos estáticos
    if path.startswith("/static/") and method in ("GET", "HEAD"):
        rel_path = path.lstrip("/").replace("/", os.sep)
        abs_path = os.path.abspath(os.path.join(BASE_DIR, rel_path))
        if abs_path.startswith(os.path.join(BASE_DIR, "static")) and os.path.isfile(abs_path):
            mime, _ = mimetypes.guess_type(abs_path)
            with open(abs_path, "rb") as f:
                content = f.read()
            start_response(
                "200 OK",
                [
                    ("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8"),
                    ("Content-Length", str(len(content))),
                ]
                + no_cache,
            )
            return [] if method == "HEAD" else [content]
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Arquivo nao encontrado"]

    # Rotas de API
    if path.startswith("/api/"):
        try:
            content_length = int(environ.get("CONTENT_LENGTH") or 0)
            body = {}
            if content_length > 0:
                raw_body = environ["wsgi.input"].read(content_length).decode("utf-8")
                if raw_body.strip():
                    body = json.loads(raw_body)
            result = dispatch_api(method, path, query, body, headers)
            payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
            start_response("200 OK", [("Content-Type", "application/json; charset=utf-8")] + no_cache)
            return [payload]
        except APIError as err:
            status_map = {
                400: "400 Bad Request",
                401: "401 Unauthorized",
                403: "403 Forbidden",
                404: "404 Not Found",
            }
            payload = json.dumps({"erro": err.message}, ensure_ascii=False).encode("utf-8")
            start_response(
                status_map.get(err.status_code, "400 Bad Request"),
                [("Content-Type", "application/json; charset=utf-8")] + no_cache,
            )
            return [payload]
        except Exception as exc:
            payload = json.dumps({"erro": f"Erro interno: {str(exc)}"}, ensure_ascii=False).encode("utf-8")
            start_response(
                "500 Internal Server Error",
                [("Content-Type", "application/json; charset=utf-8")] + no_cache,
            )
            return [payload]

    start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
    return [b"Nao encontrado"]


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  CONE MÁGICO - Sistema de Gestão para Sorveteria & PDV")
    print(f"  Acesse no navegador: http://localhost:{port}")
    print("=" * 60)
    with make_server("0.0.0.0", port, wsgi_app) as httpd:
        httpd.serve_forever()
