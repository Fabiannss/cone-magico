const App = {
    currentUser: null,
    usuarios: [],
    produtos: [],
    estoque: [],
    clientes: [],
    vendas: [],
    carrinhoPDV: [],
    categoriaPDV: "",
    modoGrafico: "pizza",

    async init() {
        const hoje = new Date().toISOString().slice(0, 10);
        const mesAtual = hoje.slice(0, 7);
        const finMesEl = document.getElementById("filtro-fin-mes");
        if (finMesEl) finMesEl.value = mesAtual;
        const despMesEl = document.getElementById("filtro-desp-mes");
        if (despMesEl) despMesEl.value = mesAtual;

        await this.loadUsuariosPublic();

        const saved = sessionStorage.getItem("cone_magico_user");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const fresh = this.usuarios.find((u) => u.id === parsed.id);
                if (fresh) {
                    await this.entrarComUsuario(fresh);
                    return;
                }
            } catch (_) {}
        }
        this.mostrarTelaLogin();
    },

    async loadUsuariosPublic() {
        try {
            this.usuarios = await this.api("/api/usuarios");
            this.renderQuickLoginAccounts();
        } catch (_) {}
    },

    mostrarTelaLogin() {
        this.currentUser = null;
        sessionStorage.removeItem("cone_magico_user");
        document.getElementById("app-main-layout").style.display = "none";
        document.getElementById("login-screen").style.display = "flex";
        document.getElementById("login-erro").style.display = "none";
        this.renderQuickLoginAccounts();
    },

    renderQuickLoginAccounts() {
        const box = document.getElementById("login-quick-accounts");
        if (!box) return;
        box.innerHTML = this.usuarios
            .map(
                (u) => `
            <button type="button" class="login-quick-item" onclick="App.preencherLogin('${u.email}')">
                <div>
                    <strong>${u.perfil === "admin" ? "👑 " : "🍦 "}${u.nome}</strong><br>
                    <span style="color:#64748b;">Login: <strong>${u.email}</strong> • ${u.cargo || ""}</span>
                </div>
                <span class="badge ${u.perfil === "admin" ? "badge-warning" : "badge-pink"}">
                    ${u.perfil === "admin" ? "ADMIN (Dono)" : "FUNCIONÁRIO"}
                </span>
            </button>`
            )
            .join("");
    },

    preencherLogin(email) {
        document.getElementById("login-email").value = email;
        document.getElementById("login-senha").value = "123456";
        document.getElementById("login-erro").style.display = "none";
    },

    async fazerLogin() {
        const email = document.getElementById("login-email").value.trim();
        const senha = document.getElementById("login-senha").value;
        const erroEl = document.getElementById("login-erro");
        erroEl.style.display = "none";

        try {
            const res = await this.api("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, senha }),
            });
            await this.entrarComUsuario(res.usuario);
            this.toast(`Bem-vindo(a) à Sorveteria Cone Mágico, ${res.usuario.nome}!`);
        } catch (e) {
            erroEl.textContent = e.message;
            erroEl.style.display = "block";
        }
    },

    async entrarComUsuario(user) {
        this.currentUser = user;
        sessionStorage.setItem("cone_magico_user", JSON.stringify(user));
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("app-main-layout").style.display = "grid";

        this.renderUserSelect();
        this.applyRolePermissions();

        await Promise.all([
            this.loadProdutos(),
            this.loadClientes(),
            this.loadEstoque(),
            this.loadUsuarios(),
        ]);

        if (user.perfil === "admin") {
            this.navigate("dashboard");
        } else {
            this.navigate("pdv");
        }
    },

    logout() {
        this.mostrarTelaLogin();
        this.toast("Sessão encerrada com segurança.");
    },

    applyRolePermissions() {
        const isAdmin = this.currentUser && this.currentUser.perfil === "admin";
        document.querySelectorAll("[data-admin-only='true']").forEach((el) => {
            el.style.display = isAdmin ? "" : "none";
        });
    },

    async api(path, options = {}) {
        const headers = options.headers || {};
        headers["Content-Type"] = "application/json";
        if (this.currentUser) {
            headers["X-User-Id"] = String(this.currentUser.id);
        }
        const resp = await fetch(path, { ...options, headers });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.erro || "Ocorreu um erro na requisição.");
        }
        return data;
    },

    toast(msg) {
        const el = document.getElementById("toast");
        el.textContent = msg;
        el.style.display = "block";
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.style.display = "none";
        }, 3600);
    },

    formatBRL(v) {
        return Number(v || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
        });
    },

    formatDateBR(iso) {
        if (!iso) return "-";
        const parts = iso.slice(0, 10).split("-");
        if (parts.length !== 3) return iso;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    },

    toggleMobileSidebar() {
        const sb = document.getElementById("app-sidebar");
        const bd = document.getElementById("sidebar-backdrop");
        if (sb) sb.classList.toggle("open");
        if (bd) bd.classList.toggle("open");
    },

    closeMobileSidebar() {
        const sb = document.getElementById("app-sidebar");
        const bd = document.getElementById("sidebar-backdrop");
        if (sb) sb.classList.remove("open");
        if (bd) bd.classList.remove("open");
    },

    navigate(view) {
        this.closeMobileSidebar();
        const isAdmin = this.currentUser && this.currentUser.perfil === "admin";
        const adminOnlyViews = ["dashboard", "financeiro", "despesas", "usuarios"];
        if (!isAdmin && adminOnlyViews.includes(view)) {
            this.toast("Acesso restrito ao ADMIN (Dono). Funcionários utilizam PDV, Cardápio, Estoque e Fidelidade.");
            view = "pdv";
        }

        document.querySelectorAll(".view-section").forEach((s) => (s.style.display = "none"));
        const target = document.getElementById(`view-${view}`);
        if (target) target.style.display = "block";

        document.querySelectorAll(".nav-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.view === view);
        });

        if (view === "dashboard") this.loadDashboard();
        if (view === "pdv") this.initPDV();
        if (view === "cardapio") this.loadProdutos();
        if (view === "estoque") this.loadEstoque();
        if (view === "clientes") this.loadClientes();
        if (view === "financeiro") this.loadFinanceiro();
        if (view === "despesas") this.loadDespesasSorveteria();
        if (view === "usuarios") this.loadUsuarios();
    },

    renderUserSelect() {
        const nameEl = document.getElementById("logged-user-name");
        const emailEl = document.getElementById("logged-user-email");
        const roleEl = document.getElementById("current-user-role");
        const pdvOp = document.getElementById("pdv-operador-label");
        if (this.currentUser) {
            if (nameEl) nameEl.textContent = this.currentUser.nome;
            if (emailEl) emailEl.textContent = `Login: ${this.currentUser.email} • ${this.currentUser.turno || ""}`;
            if (pdvOp) pdvOp.textContent = `Atendente: ${this.currentUser.nome}`;
            if (roleEl) {
                roleEl.innerHTML =
                    this.currentUser.perfil === "admin"
                        ? `👑 ADMIN (Dono) • Acesso Total`
                        : `🍦 FUNCIONÁRIO • PDV, Sangria & Operação`;
            }
        }
    },

    // ==========================================
    // 1. DASHBOARD EXECUTIVO (EXCLUSIVO ADMIN)
    // ==========================================
    async loadDashboard() {
        try {
            const d = await this.api("/api/dashboard");
            document.getElementById("dash-date-subtitle").textContent =
                `Resumo operacional da sorveteria (${this.formatDateBR(d.hoje)})`;
            document.getElementById("kpi-faturamento-hoje").textContent = this.formatBRL(d.faturamento_hoje);
            document.getElementById("kpi-pedidos-hoje-sub").textContent =
                `${d.pedidos_hoje} pedido(s) • ${d.sorvetes_hoje} item(ns) vendido(s) hoje`;
            document.getElementById("kpi-receita-paga").textContent =
                this.formatBRL(d.financeiro_mes.receitas_pagas);
            document.getElementById("kpi-pedidos-mes-sub").textContent =
                `${d.pedidos_mes} pedidos concluídos no mês`;
            document.getElementById("kpi-despesas-mes").textContent =
                this.formatBRL(d.financeiro_mes.despesas_pagas);

            const despPend = d.financeiro_mes.despesas_pendentes || 0;
            document.getElementById("kpi-despesas-sub").textContent =
                despPend > 0
                    ? `Contas a pagar: ${this.formatBRL(despPend)}`
                    : "Saídas quitadas no mês";

            const saldoEl = document.getElementById("kpi-saldo-liquido");
            saldoEl.textContent = this.formatBRL(d.financeiro_mes.saldo_liquido);
            saldoEl.style.color = d.financeiro_mes.saldo_liquido >= 0 ? "var(--success)" : "var(--danger)";

            document.getElementById("kpi-pendentes-sub").textContent =
                d.financeiro_mes.receitas_pendentes > 0
                    ? `A receber: ${this.formatBRL(d.financeiro_mes.receitas_pendentes)}`
                    : "Receitas pagas - Despesas pagas";

            document.getElementById("kpi-estoque-baixo").textContent = d.total_estoque_baixo;

            // Vendas de Hoje
            const tbodyVendas = document.getElementById("dash-vendas-tbody");
            if (d.vendas_hoje.length === 0) {
                tbodyVendas.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b;">Nenhuma venda registrada hoje ainda.</td></tr>`;
            } else {
                tbodyVendas.innerHTML = d.vendas_hoje
                    .slice(0, 8)
                    .map(
                        (v) => `
                    <tr>
                        <td>
                            <strong>#${v.codigo_pedido}</strong><br>
                            <small style="color:#64748b;">${v.hora_venda} • ${v.tipo_atendimento}</small>
                        </td>
                        <td>${v.itens_resumo}</td>
                        <td>${v.cliente_nome || "Balcão"}</td>
                        <td><span class="badge badge-info">${v.forma_pagamento}</span></td>
                        <td><strong style="color:var(--primary);">${this.formatBRL(v.valor_total)}</strong></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick='App.emitirCupomVenda(${JSON.stringify(v).replace(/'/g, "&#39;")})'>🧾 Cupom</button>
                        </td>
                    </tr>`
                    )
                    .join("");
            }

            // Alertas de Estoque Baixo
            const tbodyEst = document.getElementById("dash-estoque-tbody");
            if (d.estoque_baixo.length === 0) {
                tbodyEst.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#16a34a;">✅ Todos os insumos estão acima do estoque mínimo!</td></tr>`;
            } else {
                tbodyEst.innerHTML = d.estoque_baixo
                    .map(
                        (e) => `
                    <tr>
                        <td>
                            <strong>${e.item}</strong><br>
                            <small style="color:#64748b;">${e.categoria}</small>
                        </td>
                        <td><strong style="color:#dc2626;">${e.quantidade_atual} ${e.unidade}</strong></td>
                        <td>${e.quantidade_minima} ${e.unidade}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="App.movimentarEstoqueRapido(${e.id}, 'entrada')">+ Repor</button>
                        </td>
                    </tr>`
                    )
                    .join("");
            }

            // Despesas da Sorveteria
            const tbodyDesp = document.getElementById("dash-despesas-tbody");
            const listaDesp = d.despesas_sorveteria || [];
            this._despesasSorveteriaCache = listaDesp;
            if (listaDesp.length === 0) {
                tbodyDesp.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhuma despesa registrada.</td></tr>`;
            } else {
                tbodyDesp.innerHTML = listaDesp
                    .map(
                        (f) => `
                    <tr>
                        <td>
                            <strong>${this.formatDateBR(f.data_vencimento)}</strong>
                            ${f.data_pagamento ? `<br><small style="color:#16a34a;">Pago em ${this.formatDateBR(f.data_pagamento)}</small>` : ""}
                        </td>
                        <td><span class="badge badge-danger">🏢 ${f.categoria}</span></td>
                        <td>
                            <strong>${f.descricao}</strong>
                            ${f.observacoes ? `<br><small style="color:#64748b;">${f.observacoes}</small>` : ""}
                        </td>
                        <td>${f.forma_pagamento || "-"}</td>
                        <td><strong style="color:#b91c1c;">${this.formatBRL(f.valor)}</strong></td>
                        <td>
                            <span class="badge ${f.status_pagamento === "Pago" ? "badge-success" : "badge-warning"}">${f.status_pagamento}</span>
                        </td>
                        <td>
                            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                                ${
                                    f.status_pagamento === "Pendente"
                                        ? `<button class="btn btn-sm btn-primary" onclick="App.quitarLancamento(${f.id})">✓ Dar Baixa</button>`
                                        : ""
                                }
                                <button class="btn btn-sm btn-secondary" onclick="App.editarDespesaSorveteria(${f.id})">Editar</button>
                            </div>
                        </td>
                    </tr>`
                    )
                    .join("");
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // 2. PDV / FRENTE DE CAIXA & SANGRIA RÁPIDA
    // ==========================================
    async initPDV() {
        await Promise.all([
            this.loadProdutos(),
            this.loadClientes(),
            this.loadVendas(),
            this.loadCaixaRapido(),
        ]);
        this.renderCatalogoPDV();
        this.renderCarrinhoPDV();
    },

    setCategoriaPDV(cat) {
        this.categoriaPDV = cat;
        document.querySelectorAll("#pdv-cat-pills .pdv-cat-pill").forEach((btn) => {
            const btnText = btn.getAttribute("onclick") || "";
            btn.classList.toggle("active", btnText.includes(`'${cat}'`));
        });
        this.renderCatalogoPDV();
    },

    renderCatalogoPDV() {
        const grid = document.getElementById("pdv-products-grid");
        if (!grid) return;
        const busca = (document.getElementById("pdv-busca-produto")?.value || "").toLowerCase().trim();

        const disponiveis = this.produtos.filter((p) => {
            if (!p.disponivel) return false;
            if (this.categoriaPDV && p.categoria !== this.categoriaPDV) return false;
            if (
                busca &&
                !p.nome.toLowerCase().includes(busca) &&
                !(p.sabor_detalhe || "").toLowerCase().includes(busca) &&
                !p.categoria.toLowerCase().includes(busca)
            ) {
                return false;
            }
            return true;
        });

        if (disponiveis.length === 0) {
            grid.innerHTML = `<p style="color:#64748b; padding:1rem 0; grid-column: 1 / -1;">Nenhum sabor/produto disponível para este filtro.</p>`;
            return;
        }

        grid.innerHTML = disponiveis
            .map(
                (p) => `
            <button type="button" class="pdv-product-card" onclick="App.adicionarAoCarrinhoPDV(${p.id})">
                <div>
                    <div class="prod-cat">${p.categoria}</div>
                    <div class="prod-name">${p.nome}</div>
                    <div class="prod-desc">${p.sabor_detalhe || "Sorvete artesanal Cone Mágico"}</div>
                </div>
                <div class="prod-price-row">
                    <span class="prod-price">${this.formatBRL(p.preco)}</span>
                    <span class="badge badge-pink">+ Adicionar</span>
                </div>
            </button>`
            )
            .join("");
    },

    adicionarAoCarrinhoPDV(prodId) {
        const prod = this.produtos.find((p) => p.id === prodId);
        if (!prod) return;
        const existente = this.carrinhoPDV.find((i) => i.produto_id === prodId);
        if (existente) {
            existente.qtd += 1;
        } else {
            this.carrinhoPDV.push({
                produto_id: prod.id,
                nome: prod.nome,
                preco: Number(prod.preco),
                qtd: 1,
            });
        }
        this.renderCarrinhoPDV();
    },

    alterarQtdCarrinhoPDV(idx, delta) {
        if (!this.carrinhoPDV[idx]) return;
        this.carrinhoPDV[idx].qtd += delta;
        if (this.carrinhoPDV[idx].qtd <= 0) {
            this.carrinhoPDV.splice(idx, 1);
        }
        this.renderCarrinhoPDV();
    },

    limparCarrinhoPDV() {
        this.carrinhoPDV = [];
        document.getElementById("pdv-desconto").value = "0.00";
        document.getElementById("pdv-observacoes").value = "";
        document.getElementById("pdv-cliente").value = "";
        this.aoSelecionarClientePDV();
        this.renderCarrinhoPDV();
    },

    aoSelecionarClientePDV() {
        const cliId = document.getElementById("pdv-cliente")?.value;
        const infoEl = document.getElementById("pdv-cliente-fidelidade-info");
        if (!infoEl) return;
        if (!cliId) {
            infoEl.style.display = "none";
            return;
        }
        const cli = this.clientes.find((c) => String(c.id) === String(cliId));
        if (!cli) {
            infoEl.style.display = "none";
            return;
        }
        infoEl.style.display = "block";
        const pts = cli.pontos_fidelidade || 0;
        if (pts >= 10) {
            infoEl.innerHTML = `🎉 <strong>${cli.nome}</strong> possui <strong>${pts} selos</strong>! Pode resgatar <strong>1 Sorvete Grátis</strong> selecionando "Resgate Fidelidade" na forma de pagamento!`;
        } else {
            infoEl.innerHTML = `🍦 <strong>${cli.nome}</strong> possui <strong>${pts}/10 selos</strong> no Cartão Fidelidade (faltam ${10 - pts} para ganhar 1 grátis).`;
        }
    },

    renderCarrinhoPDV() {
        const box = document.getElementById("pdv-cart-items");
        if (!box) return;

        if (this.carrinhoPDV.length === 0) {
            box.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:1.75rem 0.5rem; font-size:0.86rem;">Nenhum item adicionado ainda.<br>Clique nos sorvetes ao lado para montar o pedido!</div>`;
        } else {
            box.innerHTML = this.carrinhoPDV
                .map(
                    (it, idx) => `
                <div class="pdv-cart-item">
                    <div style="flex:1;">
                        <strong>${it.nome}</strong><br>
                        <small style="color:#64748b;">${this.formatBRL(it.preco)} un.</small>
                    </div>
                    <div class="pdv-qty-controls">
                        <button type="button" class="pdv-qty-btn" onclick="App.alterarQtdCarrinhoPDV(${idx}, -1)">-</button>
                        <strong style="min-width:20px; text-align:center;">${it.qtd}</strong>
                        <button type="button" class="pdv-qty-btn" onclick="App.alterarQtdCarrinhoPDV(${idx}, 1)">+</button>
                    </div>
                    <div style="min-width:75px; text-align:right; font-weight:700; color:#0f172a;">
                        ${this.formatBRL(it.preco * it.qtd)}
                    </div>
                </div>`
                )
                .join("");
        }

        const subtotal = this.carrinhoPDV.reduce((acc, i) => acc + i.preco * i.qtd, 0);
        const qtdTotal = this.carrinhoPDV.reduce((acc, i) => acc + i.qtd, 0);
        const desconto = Number(document.getElementById("pdv-desconto")?.value || 0);
        const forma = document.getElementById("pdv-forma-pagamento")?.value || "PIX";
        const totalFinal = forma === "Fidelidade / Prêmio" ? 0 : Math.max(0, subtotal - desconto);

        document.getElementById("pdv-qtd-itens-label").textContent = `${qtdTotal} item(ns) no pedido`;
        document.getElementById("pdv-total-valor").textContent = this.formatBRL(totalFinal);
    },

    async finalizarVendaPDV() {
        if (this.carrinhoPDV.length === 0) {
            this.toast("Adicione pelo menos 1 item da sorveteria ao pedido!");
            return;
        }
        try {
            const body = {
                itens: this.carrinhoPDV,
                cliente_id: document.getElementById("pdv-cliente").value || null,
                tipo_atendimento: document.getElementById("pdv-tipo-atendimento").value,
                desconto: document.getElementById("pdv-desconto").value || 0,
                forma_pagamento: document.getElementById("pdv-forma-pagamento").value,
                observacoes: document.getElementById("pdv-observacoes").value,
            };
            const res = await this.api("/api/vendas", {
                method: "POST",
                body: JSON.stringify(body),
            });
            this.toast(res.mensagem);
            this.limparCarrinhoPDV();
            await Promise.all([this.loadVendas(), this.loadClientes()]);
            if (this.currentUser && this.currentUser.perfil === "admin") {
                await this.loadDashboard();
            }
            if (res.venda) {
                this.emitirCupomVenda(res.venda);
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    async loadVendas() {
        const dataFiltro = document.getElementById("filtro-vendas-data")?.value || "";
        const params = new URLSearchParams();
        if (dataFiltro) {
            params.set("data_inicio", dataFiltro);
            params.set("data_fim", dataFiltro);
        }
        this.vendas = await this.api(`/api/vendas?${params.toString()}`);
        const tbody = document.getElementById("vendas-tbody");
        if (!tbody) return;

        if (this.vendas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhuma venda encontrada para a data selecionada.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.vendas
            .map(
                (v) => `
            <tr style="${v.status === "Cancelada" ? "opacity:0.55; text-decoration:line-through;" : ""}">
                <td>
                    <strong>#${v.codigo_pedido}</strong><br>
                    <small style="color:#64748b;">${this.formatDateBR(v.data_venda)} às ${v.hora_venda}</small>
                </td>
                <td>
                    <strong>${v.itens_resumo}</strong>
                    ${v.observacoes ? `<br><small style="color:#64748b;">Obs: ${v.observacoes}</small>` : ""}
                </td>
                <td>${v.cliente_nome || "Cliente Balcão"}<br><small style="color:#64748b;">${v.tipo_atendimento}</small></td>
                <td>${v.funcionario_nome || "-"}</td>
                <td><span class="badge badge-info">${v.forma_pagamento}</span></td>
                <td><strong style="color:var(--primary);">${this.formatBRL(v.valor_total)}</strong></td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="App.emitirCupomPorId(${v.id})">🧾 Cupom</button>
                        ${
                            v.status !== "Cancelada"
                                ? `<button class="btn btn-sm btn-danger" onclick="App.cancelarVenda(${v.id})">✕</button>`
                                : `<span class="badge badge-danger">Cancelada</span>`
                        }
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    emitirCupomPorId(id) {
        const venda = (this.vendas || []).find((v) => v.id === id);
        if (venda) this.emitirCupomVenda(venda);
    },

    emitirCupomVenda(v) {
        let itensHtml = "";
        try {
            const parsed = JSON.parse(v.itens_json || "[]");
            itensHtml = parsed
                .map(
                    (i) => `
                <tr>
                    <td style="padding:4px 0;">${i.qtd}x ${i.nome}</td>
                    <td style="padding:4px 0; text-align:right;">${this.formatBRL(i.subtotal)}</td>
                </tr>`
                )
                .join("");
        } catch (_) {
            itensHtml = `<tr><td colspan="2">${v.itens_resumo}</td></tr>`;
        }

        const win = window.open("", "_blank", "width=420,height=640");
        win.document.write(`
            <html>
            <head>
                <title>Cupom de Venda #${v.codigo_pedido} - Cone Mágico</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; color: #0f172a; max-width: 340px; margin: 0 auto; }
                    .cupom-box { border: 1px dashed #334155; padding: 18px; border-radius: 8px; background: #fffef7; }
                    .center { text-align: center; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
                    .divider { border-top: 1px dashed #64748b; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="cupom-box">
                    <div class="center">
                        <img src="/static/img/logo.svg" style="width:60px; height:60px;"><br>
                        <strong style="font-size:17px;">SORVETERIA CONE MÁGICO</strong><br>
                        <small>Sorvetes Artesanais, Casquinhas & Taças</small><br>
                        <small>CUPOM DE PEDIDO: <strong>#${v.codigo_pedido}</strong></small>
                    </div>
                    <div class="divider"></div>
                    <div style="font-size:12px;">
                        <strong>Data/Hora:</strong> ${this.formatDateBR(v.data_venda)} às ${v.hora_venda}<br>
                        <strong>Atendimento:</strong> ${v.tipo_atendimento}<br>
                        <strong>Cliente:</strong> ${v.cliente_nome || "Consumidor Balcão"}<br>
                        <strong>Atendente:</strong> ${v.funcionario_nome || "-"}
                    </div>
                    <div class="divider"></div>
                    <table>
                        <thead>
                            <tr style="border-bottom:1px solid #cbd5e1;">
                                <th style="text-align:left;">ITEM</th>
                                <th style="text-align:right;">VALOR</th>
                            </tr>
                        </thead>
                        <tbody>${itensHtml}</tbody>
                    </table>
                    <div class="divider"></div>
                    <div style="display:flex; justify-content:space-between; font-size:13px;">
                        <span>Subtotal:</span>
                        <span>${this.formatBRL(v.subtotal)}</span>
                    </div>
                    ${
                        v.desconto > 0
                            ? `<div style="display:flex; justify-content:space-between; font-size:13px;"><span>Desconto:</span><span>- ${this.formatBRL(v.desconto)}</span></div>`
                            : ""
                    }
                    <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold; margin-top:6px;">
                        <span>TOTAL PAGO:</span>
                        <span>${this.formatBRL(v.valor_total)}</span>
                    </div>
                    <div style="font-size:12px; margin-top:6px;">
                        <strong>Forma de Pagamento:</strong> ${v.forma_pagamento}
                    </div>
                    ${v.observacoes ? `<div style="font-size:12px; margin-top:6px;"><strong>Obs:</strong> ${v.observacoes}</div>` : ""}
                    <div class="divider"></div>
                    <div class="center" style="font-size:11px; color:#475569;">
                        🎁 Junte 10 selos no Programa Fidelidade Cone Mágico e ganhe 1 Sorvete Grátis!<br>
                        Obrigado pela preferência! Volte sempre! 🍦
                    </div>
                </div>
                <script>setTimeout(() => window.print(), 250);</script>
            </body>
            </html>
        `);
        win.document.close();
    },

    async cancelarVenda(id) {
        if (!confirm("Deseja cancelar este pedido e estornar do caixa?")) return;
        try {
            const res = await this.api(`/api/vendas/${id}`, { method: "DELETE" });
            this.toast(res.mensagem);
            await this.loadVendas();
            if (this.currentUser && this.currentUser.perfil === "admin") {
                await this.loadDashboard();
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // SANGRIA / SUPRIMENTO RÁPIDO DE CAIXA (FUNCIONÁRIO E ADMIN)
    // ==========================================
    async loadCaixaRapido() {
        try {
            const data = await this.api("/api/caixa-rapido");
            const tbody = document.getElementById("caixa-rapido-tbody");
            if (!tbody) return;
            const lista = data.movimentos || [];
            if (lista.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b;">Nenhuma sangria ou suprimento rápido registrado hoje.</td></tr>`;
                return;
            }
            tbody.innerHTML = lista
                .map(
                    (m) => `
                <tr>
                    <td><strong>${this.formatDateBR(m.data_vencimento)}</strong></td>
                    <td>
                        <span class="badge ${m.tipo === "Despesa" ? "badge-danger" : "badge-success"}">
                            ${m.tipo === "Despesa" ? "🔻 Sangria / Despesa Caixa" : "🔺 Suprimento / Troco"}
                        </span>
                    </td>
                    <td>
                        <strong>${m.descricao}</strong>
                        ${m.observacoes ? `<br><small style="color:#64748b;">${m.observacoes}</small>` : ""}
                    </td>
                    <td>${m.forma_pagamento}</td>
                    <td>${m.funcionario_nome || "-"}</td>
                    <td>
                        <strong style="color:${m.tipo === "Despesa" ? "#b91c1c" : "#15803d"};">
                            ${m.tipo === "Despesa" ? "- " : "+ "}${this.formatBRL(m.valor)}
                        </strong>
                    </td>
                </tr>`
                )
                .join("");
        } catch (e) {
            this.toast(e.message);
        }
    },

    openModalCaixaRapido() {
        document.getElementById("form-caixa-rapido").reset();
        document.getElementById("modal-caixa-rapido").classList.add("open");
    },

    async salvarCaixaRapido() {
        try {
            const body = {
                natureza: document.getElementById("cx-natureza").value,
                forma_pagamento: document.getElementById("cx-forma").value,
                descricao: document.getElementById("cx-descricao").value,
                valor: document.getElementById("cx-valor").value,
                observacoes: document.getElementById("cx-obs").value,
            };
            const res = await this.api("/api/caixa-rapido", {
                method: "POST",
                body: JSON.stringify(body),
            });
            this.toast(res.mensagem);
            this.closeModal("modal-caixa-rapido");
            await this.loadCaixaRapido();
            if (this.currentUser && this.currentUser.perfil === "admin") {
                await this.loadDashboard();
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // 3. CARDÁPIO & SABORES
    // ==========================================
    async loadProdutos() {
        const busca = document.getElementById("filtro-prod-busca")?.value || "";
        const cat = document.getElementById("filtro-prod-categoria")?.value || "";
        const params = new URLSearchParams();
        if (busca) params.set("busca", busca);
        if (cat) params.set("categoria", cat);

        this.produtos = await this.api(`/api/produtos?${params.toString()}`);
        this.renderCatalogoPDV();

        const tbody = document.getElementById("produtos-tbody");
        if (!tbody) return;
        const isAdmin = this.currentUser && this.currentUser.perfil === "admin";

        if (this.produtos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b;">Nenhum produto encontrado no cardápio.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.produtos
            .map(
                (p) => `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td><span class="badge badge-info">${p.categoria}</span></td>
                <td><small style="color:#475569;">${p.sabor_detalhe || "-"}</small></td>
                <td>
                    <strong style="color:var(--primary);">${this.formatBRL(p.preco)}</strong>
                    ${isAdmin && p.custo_unitario ? `<br><small style="color:#64748b;">Custo: ${this.formatBRL(p.custo_unitario)}</small>` : ""}
                </td>
                <td>
                    <span class="badge ${p.disponivel ? "badge-success" : "badge-danger"}">
                        ${p.disponivel ? "Disponível no Balcão" : "Esgotado Hoje"}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="App.alternarDisponibilidadeProduto(${p.id}, ${p.disponivel ? 1 : 0})">
                            ${p.disponivel ? "Pausar Sabor" : "Ativar Sabor"}
                        </button>
                        ${
                            isAdmin
                                ? `<button class="btn btn-sm btn-secondary" onclick="App.editarProduto(${p.id})">Editar</button>
                                   <button class="btn btn-sm btn-danger" onclick="App.excluirProduto(${p.id})">✕</button>`
                                : ""
                        }
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    openModalProduto(prod = null) {
        document.getElementById("form-produto").reset();
        document.getElementById("prod-id").value = prod ? prod.id : "";
        document.getElementById("modal-produto-titulo").textContent = prod
            ? `Editar Item: ${prod.nome}`
            : "Novo Sabor / Produto do Cardápio";

        if (prod) {
            document.getElementById("prod-nome").value = prod.nome || "";
            document.getElementById("prod-categoria").value = prod.categoria || "Casquinha / Cascão";
            document.getElementById("prod-detalhe").value = prod.sabor_detalhe || "";
            document.getElementById("prod-preco").value = prod.preco || "";
            document.getElementById("prod-custo").value = prod.custo_unitario || 0;
            document.getElementById("prod-disponivel").value = prod.disponivel ? "1" : "0";
        }
        document.getElementById("modal-produto").classList.add("open");
    },

    editarProduto(id) {
        const prod = this.produtos.find((p) => p.id === id);
        if (prod) this.openModalProduto(prod);
    },

    async salvarProduto() {
        try {
            const id = document.getElementById("prod-id").value;
            const body = {
                nome: document.getElementById("prod-nome").value,
                categoria: document.getElementById("prod-categoria").value,
                sabor_detalhe: document.getElementById("prod-detalhe").value,
                preco: document.getElementById("prod-preco").value,
                custo_unitario: document.getElementById("prod-custo").value,
                disponivel: document.getElementById("prod-disponivel").value === "1",
            };
            const url = id ? `/api/produtos/${id}` : "/api/produtos";
            const method = id ? "PUT" : "POST";
            const res = await this.api(url, { method, body: JSON.stringify(body) });
            this.toast(res.mensagem);
            this.closeModal("modal-produto");
            await this.loadProdutos();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async alternarDisponibilidadeProduto(id, dispAtual) {
        try {
            const res = await this.api(`/api/produtos/${id}/disponibilidade`, {
                method: "PATCH",
                body: JSON.stringify({ disponivel: !dispAtual }),
            });
            this.toast(res.mensagem);
            await this.loadProdutos();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async excluirProduto(id) {
        if (!confirm("Deseja remover este produto do cardápio?")) return;
        try {
            const res = await this.api(`/api/produtos/${id}`, { method: "DELETE" });
            this.toast(res.mensagem);
            await this.loadProdutos();
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // 4. CONTROLE DE ESTOQUE & INSUMOS
    // ==========================================
    async loadEstoque() {
        const cat = document.getElementById("filtro-est-categoria")?.value || "";
        const alerta = document.getElementById("filtro-est-alerta")?.value || "";
        const params = new URLSearchParams();
        if (cat) params.set("categoria", cat);
        if (alerta) params.set("alerta", alerta);

        this.estoque = await this.api(`/api/estoque?${params.toString()}`);

        const baixos = this.estoque.filter((e) => e.quantidade_atual <= e.quantidade_minima).length;
        const ok = this.estoque.length - baixos;

        const elTot = document.getElementById("est-kpi-total");
        if (elTot) elTot.textContent = this.estoque.length;
        const elBaixo = document.getElementById("est-kpi-baixo");
        if (elBaixo) elBaixo.textContent = baixos;
        const elOk = document.getElementById("est-kpi-ok");
        if (elOk) elOk.textContent = ok;

        const navBadge = document.getElementById("nav-badge-estoque");
        if (navBadge) {
            navBadge.style.display = baixos > 0 ? "inline-flex" : "none";
            navBadge.textContent = `${baixos}!`;
        }

        const tbody = document.getElementById("estoque-tbody");
        if (!tbody) return;
        const isAdmin = this.currentUser && this.currentUser.perfil === "admin";

        if (this.estoque.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhum item de estoque para o filtro selecionado.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.estoque
            .map((e) => {
                const critico = e.quantidade_atual <= e.quantidade_minima;
                return `
                <tr style="${critico ? "background:#fef2f2;" : ""}">
                    <td>
                        <strong>${e.item}</strong><br>
                        <small style="color:#64748b;">Atualizado: ${e.atualizado_em || "-"}</small>
                    </td>
                    <td><span class="badge badge-neutral">${e.categoria}</span></td>
                    <td><strong style="font-size:1rem; color:${critico ? "#dc2626" : "#0f172a"};">${e.quantidade_atual} ${e.unidade}</strong></td>
                    <td>${e.quantidade_minima} ${e.unidade}</td>
                    <td>${e.fornecedor || "-"}</td>
                    <td>
                        <span class="badge ${critico ? "badge-danger" : "badge-success"}">
                            ${critico ? "⚠️ Estoque Baixo" : "✅ Normal"}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                            <button class="btn btn-sm btn-primary" onclick="App.movimentarEstoqueRapido(${e.id}, 'entrada')">+ Entrada</button>
                            <button class="btn btn-sm btn-secondary" onclick="App.movimentarEstoqueRapido(${e.id}, 'baixa')">- Baixa</button>
                            <button class="btn btn-sm btn-secondary" onclick="App.editarEstoque(${e.id})">Editar</button>
                            ${
                                isAdmin
                                    ? `<button class="btn btn-sm btn-danger" onclick="App.excluirEstoque(${e.id})">✕</button>`
                                    : ""
                            }
                        </div>
                    </td>
                </tr>`;
            })
            .join("");
    },

    openModalEstoque(item = null) {
        document.getElementById("form-estoque").reset();
        document.getElementById("est-id").value = item ? item.id : "";
        document.getElementById("modal-estoque-titulo").textContent = item
            ? `Editar Insumo: ${item.item}`
            : "Cadastrar Insumo no Estoque";

        if (item) {
            document.getElementById("est-item").value = item.item || "";
            document.getElementById("est-categoria").value = item.categoria || "Bases & Laticínios";
            document.getElementById("est-unidade").value = item.unidade || "un";
            document.getElementById("est-atual").value = item.quantidade_atual ?? 0;
            document.getElementById("est-minimo").value = item.quantidade_minima ?? 5;
            document.getElementById("est-custo").value = item.custo_reposicao ?? 0;
            document.getElementById("est-fornecedor").value = item.fornecedor || "";
        }
        document.getElementById("modal-estoque").classList.add("open");
    },

    editarEstoque(id) {
        const item = this.estoque.find((e) => e.id === id);
        if (item) this.openModalEstoque(item);
    },

    async salvarEstoque() {
        try {
            const id = document.getElementById("est-id").value;
            const body = {
                item: document.getElementById("est-item").value,
                categoria: document.getElementById("est-categoria").value,
                unidade: document.getElementById("est-unidade").value,
                quantidade_atual: document.getElementById("est-atual").value,
                quantidade_minima: document.getElementById("est-minimo").value,
                custo_reposicao: document.getElementById("est-custo").value,
                fornecedor: document.getElementById("est-fornecedor").value,
            };
            const url = id ? `/api/estoque/${id}` : "/api/estoque";
            const method = id ? "PUT" : "POST";
            const res = await this.api(url, { method, body: JSON.stringify(body) });
            this.toast(res.mensagem);
            this.closeModal("modal-estoque");
            await this.loadEstoque();
            if (this.currentUser && this.currentUser.perfil === "admin") {
                await this.loadDashboard();
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    async movimentarEstoqueRapido(id, operacao) {
        const item = this.estoque.find((e) => e.id === id);
        const labelOp = operacao === "entrada" ? "ENTRADA (Reposição)" : "BAIXA (Consumo no Balcão)";
        const qtdStr = prompt(
            `${labelOp} — Informe a quantidade (${item ? item.unidade : "un"}) para '${item ? item.item : "Insumo"}':`,
            "5"
        );
        if (!qtdStr) return;
        const quantidade = Number(qtdStr.replace(",", "."));
        if (isNaN(quantidade) || quantidade <= 0) {
            this.toast("Informe um valor numérico válido maior que zero.");
            return;
        }
        try {
            const res = await this.api(`/api/estoque/${id}/movimentar`, {
                method: "PATCH",
                body: JSON.stringify({ operacao, quantidade }),
            });
            this.toast(res.mensagem);
            await this.loadEstoque();
            if (this.currentUser && this.currentUser.perfil === "admin") {
                await this.loadDashboard();
            }
        } catch (e) {
            this.toast(e.message);
        }
    },

    async excluirEstoque(id) {
        if (!confirm("Deseja remover este insumo do controle de estoque?")) return;
        try {
            const res = await this.api(`/api/estoque/${id}`, { method: "DELETE" });
            this.toast(res.mensagem);
            await this.loadEstoque();
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // 5. CLIENTES & PROGRAMA FIDELIDADE
    // ==========================================
    renderSelosFidelidade(pontos) {
        const pts = Number(pontos || 0);
        const dots = [];
        for (let i = 1; i <= 10; i++) {
            const filled = i <= pts;
            dots.push(`<span class="fidelidade-dot ${filled ? "filled" : ""}">${filled ? "🍦" : i}</span>`);
        }
        return `<div class="fidelidade-bar">${dots.join("")}</div>`;
    },

    async loadClientes() {
        const busca = document.getElementById("filtro-cliente-busca")?.value || "";
        const status = document.getElementById("filtro-cliente-status")?.value || "";
        const params = new URLSearchParams();
        if (busca) params.set("busca", busca);
        if (status) params.set("status", status);

        this.clientes = await this.api(`/api/clientes?${params.toString()}`);

        const optsCli = this.clientes
            .map((c) => `<option value="${c.id}">${c.nome} (${c.pontos_fidelidade || 0}/10 selos)</option>`)
            .join("");

        const pdvCli = document.getElementById("pdv-cliente");
        if (pdvCli) {
            const valAtual = pdvCli.value;
            pdvCli.innerHTML = `<option value="">-- Cliente Balcão (Sem cadastro) --</option>` + optsCli;
            if (valAtual) pdvCli.value = valAtual;
        }
        const finCli = document.getElementById("fin-cliente");
        if (finCli) {
            finCli.innerHTML = `<option value="">-- Nenhum / Balcão Geral --</option>` + optsCli;
        }

        const tbody = document.getElementById("clientes-tbody");
        if (!tbody) return;
        if (this.clientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhum cliente cadastrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.clientes
            .map(
                (c) => `
            <tr>
                <td>
                    <strong>${c.nome}</strong><br>
                    <small style="color:#64748b;">CPF: ${c.cpf || "Não informado"}</small>
                </td>
                <td>
                    ${c.telefone || "-"}<br>
                    <small style="color:#9333ea;">🍨 ${c.sabor_favorito || "Diversos"}</small>
                </td>
                <td>
                    <strong>${c.pontos_fidelidade || 0} / 10 selos</strong>
                    ${this.renderSelosFidelidade(c.pontos_fidelidade)}
                </td>
                <td><span class="badge badge-info">🎁 ${c.premios_resgatados || 0} resgatado(s)</span></td>
                <td><strong>${this.formatBRL(c.total_compras)}</strong></td>
                <td>
                    <span class="badge ${c.status === "VIP" ? "badge-pink" : c.status === "Ativo" ? "badge-success" : "badge-neutral"}">
                        ${c.status}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        ${
                            (c.pontos_fidelidade || 0) >= 10
                                ? `<button class="btn btn-sm btn-primary" onclick="App.resgatarPremioFidelidade(${c.id})">🎁 Resgatar Grátis</button>`
                                : ""
                        }
                        <button class="btn btn-sm btn-secondary" onclick="App.editarCliente(${c.id})">Editar</button>
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    openModalCliente(cli = null) {
        document.getElementById("form-cliente").reset();
        document.getElementById("cli-id").value = cli ? cli.id : "";
        document.getElementById("modal-cliente-titulo").textContent = cli
            ? `Editar Cliente: ${cli.nome}`
            : "Cadastrar Cliente no Programa Fidelidade";

        if (cli) {
            document.getElementById("cli-nome").value = cli.nome || "";
            document.getElementById("cli-cpf").value = cli.cpf || "";
            document.getElementById("cli-telefone").value = cli.telefone || "";
            document.getElementById("cli-sabor").value = cli.sabor_favorito || "";
            document.getElementById("cli-pontos").value = cli.pontos_fidelidade || 0;
            document.getElementById("cli-status").value = cli.status || "Ativo";
            document.getElementById("cli-obs").value = cli.observacoes || "";
        }
        document.getElementById("modal-cliente").classList.add("open");
    },

    editarCliente(id) {
        const cli = this.clientes.find((c) => c.id === id);
        if (cli) this.openModalCliente(cli);
    },

    async salvarCliente() {
        try {
            const id = document.getElementById("cli-id").value;
            const body = {
                nome: document.getElementById("cli-nome").value,
                cpf: document.getElementById("cli-cpf").value,
                telefone: document.getElementById("cli-telefone").value,
                sabor_favorito: document.getElementById("cli-sabor").value,
                pontos_fidelidade: document.getElementById("cli-pontos").value,
                status: document.getElementById("cli-status").value,
                observacoes: document.getElementById("cli-obs").value,
            };
            const url = id ? `/api/clientes/${id}` : "/api/clientes";
            const method = id ? "PUT" : "POST";
            const res = await this.api(url, { method, body: JSON.stringify(body) });
            this.toast(res.mensagem);
            this.closeModal("modal-cliente");
            await this.loadClientes();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async resgatarPremioFidelidade(id) {
        if (!confirm("Confirmar o resgate de 1 Sorvete Grátis (descontando 10 selos do cartão fidelidade)?")) return;
        try {
            const res = await this.api(`/api/clientes/${id}/resgatar`, { method: "POST" });
            this.toast(res.mensagem);
            await this.loadClientes();
        } catch (e) {
            this.toast(e.message);
        }
    },

    // ==========================================
    // 6. FINANCEIRO, DASHBOARD GRÁFICO E BALANCETE (EXCLUSIVO ADMIN)
    // ==========================================
    async loadFinanceiro() {
        const mes = document.getElementById("filtro-fin-mes")?.value || "";
        const tipo = document.getElementById("filtro-fin-tipo")?.value || "";
        const status = document.getElementById("filtro-fin-status")?.value || "";

        const params = new URLSearchParams();
        if (mes) params.set("mes", mes);
        if (tipo) params.set("tipo", tipo);
        if (status) params.set("status_pagamento", status);

        const data = await this.api(`/api/financeiro?${params.toString()}`);
        document.getElementById("fin-kpi-pagas").textContent = this.formatBRL(data.resumo.receitas_pagas);
        document.getElementById("fin-kpi-pendentes").textContent = this.formatBRL(data.resumo.receitas_pendentes);
        const subPend = document.getElementById("fin-kpi-pendentes-sub");
        if (subPend) {
            subPend.textContent = `A receber: ${this.formatBRL(data.resumo.receitas_a_receber || 0)} • A pagar: ${this.formatBRL(data.resumo.despesas_pendentes || 0)}`;
        }
        document.getElementById("fin-kpi-despesas").textContent = this.formatBRL(data.resumo.despesas);
        document.getElementById("fin-kpi-saldo").textContent = this.formatBRL(data.resumo.saldo_liquido);

        this._resumoFinanceiroCache = data.resumo;
        this._lancamentosCache = data.lancamentos;
        this.renderDashboardFinanceiro();
        this.renderFluxoBalancete();

        const tbody = document.getElementById("financeiro-tbody");
        if (data.lancamentos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhum lançamento financeiro encontrado no período.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.lancamentos
            .map(
                (f) => `
            <tr>
                <td>
                    <strong>${this.formatDateBR(f.data_vencimento)}</strong>
                    ${f.data_pagamento ? `<br><small style="color:#16a34a;">Pago em ${this.formatDateBR(f.data_pagamento)}</small>` : ""}
                </td>
                <td>
                    <span class="badge ${f.tipo === "Receita" ? "badge-success" : "badge-danger"}">${f.tipo}</span><br>
                    <small style="color:#64748b;">${f.categoria}</small>
                </td>
                <td>
                    <strong>${f.descricao}</strong>
                    ${f.cliente_nome ? `<br><small style="color:#64748b;">Cliente: ${f.cliente_nome}</small>` : ""}
                    ${f.observacoes ? `<br><small style="color:#64748b;">${f.observacoes}</small>` : ""}
                </td>
                <td>${f.forma_pagamento}</td>
                <td><strong style="color:${f.tipo === "Receita" ? "#15803d" : "#b91c1c"};">${this.formatBRL(f.valor)}</strong></td>
                <td>
                    <span class="badge ${f.status_pagamento === "Pago" ? "badge-success" : "badge-warning"}">${f.status_pagamento}</span>
                </td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        ${
                            f.status_pagamento === "Pendente"
                                ? `<button class="btn btn-sm btn-primary" onclick="App.quitarLancamento(${f.id})">✓ Dar Baixa</button>`
                                : ""
                        }
                        ${
                            f.tipo === "Receita" && f.status_pagamento === "Pago"
                                ? `<button class="btn btn-sm btn-secondary" onclick="App.emitirRecibo(${f.id})">🧾 Recibo</button>`
                                : ""
                        }
                        <button class="btn btn-sm btn-secondary" onclick="App.editarLancamento(${f.id})">Editar</button>
                        <button class="btn btn-sm btn-danger" onclick="App.excluirLancamento(${f.id})">✕</button>
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    toggleDashboardFinanceiro() {
        const box = document.getElementById("fin-dashboard-box");
        const btn = document.getElementById("btn-toggle-fin-dash");
        if (!box) return;
        const abrir = box.style.display === "none";
        box.style.display = abrir ? "block" : "none";
        if (btn) {
            btn.textContent = abrir
                ? "📊 Ocultar Dashboard Financeiro"
                : "📊 Gerar Dashboard Financeiro";
        }
        if (abrir) this.renderDashboardFinanceiro();
    },

    setModoGrafico(modo) {
        this.modoGrafico = modo;
        const btnPizza = document.getElementById("btn-mode-pizza");
        const btnBarras = document.getElementById("btn-mode-barras");
        if (btnPizza) btnPizza.classList.toggle("active", modo === "pizza");
        if (btnBarras) btnBarras.classList.toggle("active", modo === "barras");
        this.renderDashboardFinanceiro();
    },

    _renderChart(containerId, items, totalBase, defaultColor) {
        if (this.modoGrafico === "pizza") {
            this._renderPieChart(containerId, items, totalBase);
        } else {
            this._renderBarChart(containerId, items, totalBase, defaultColor);
        }
    },

    _renderPieChart(containerId, items, totalBase) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const validItems = (items || []).filter((i) => i.valor > 0);
        if (validItems.length === 0 || totalBase <= 0) {
            el.innerHTML = `<p style="font-size:0.86rem; color:#64748b; padding:1rem 0;">Sem valores maiores que zero neste período.</p>`;
            return;
        }

        let cumulativePct = 0;
        const circlesSvg = validItems
            .map((it) => {
                const rawPct = (it.valor / totalBase) * 100;
                const dash = Math.max(0.5, rawPct);
                const gap = 100 - dash;
                const offset = 25 - cumulativePct;
                cumulativePct += rawPct;
                return `<circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="${it.color}" stroke-width="7.5" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}"></circle>`;
            })
            .join("");

        const legendHtml = validItems
            .map((it) => {
                const pct = Math.round((it.valor / totalBase) * 100);
                return `
                <div class="pie-legend-item">
                    <div class="pie-legend-left">
                        <span class="pie-swatch" style="background:${it.color};"></span>
                        <span>${it.label}</span>
                    </div>
                    <div>
                        <strong>${this.formatBRL(it.valor)}</strong>
                        <span style="color:#64748b; font-size:0.78rem; margin-left:4px;">(${pct}%)</span>
                    </div>
                </div>`;
            })
            .join("");

        el.innerHTML = `
            <div class="pie-chart-wrap">
                <div class="pie-svg-box">
                    <svg width="175" height="175" viewBox="0 0 42 42">
                        <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#f1f5f9" stroke-width="7.5"></circle>
                        ${circlesSvg}
                    </svg>
                    <div style="position:absolute; text-align:center; pointer-events:none;">
                        <span style="display:block; font-size:0.68rem; color:#64748b; text-transform:uppercase; font-weight:700;">Total</span>
                        <strong style="font-size:0.84rem; color:#0f172a;">${this.formatBRL(totalBase)}</strong>
                    </div>
                </div>
                <div class="pie-legend">
                    ${legendHtml}
                </div>
            </div>
        `;
    },

    _renderBarChart(containerId, items, totalBase, defaultColor) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const validItems = (items || []).filter((i) => i.valor > 0);
        if (validItems.length === 0) {
            el.innerHTML = `<p style="font-size:0.86rem; color:#64748b; padding:1rem 0;">Sem dados registrados neste período.</p>`;
            return;
        }
        const base = totalBase > 0 ? totalBase : 1;
        el.innerHTML = validItems
            .map((it) => {
                const pct = Math.min(100, Math.round((it.valor / base) * 100));
                return `
                <div class="chart-bar-row">
                    <div class="chart-bar-label">
                        <span style="display:flex; align-items:center; gap:0.45rem;">
                            <span class="pie-swatch" style="background:${it.color || defaultColor};"></span>
                            ${it.label}
                        </span>
                        <span>${this.formatBRL(it.valor)} (${pct}%)</span>
                    </div>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width:${pct}%; background:${it.color || defaultColor};"></div>
                    </div>
                </div>`;
            })
            .join("");
    },

    renderDashboardFinanceiro() {
        const lista = this._lancamentosCache || [];
        const resumo = this._resumoFinanceiroCache || {
            receitas_pagas: 0,
            receitas_pendentes: 0,
            despesas: 0,
            saldo_liquido: 0,
        };

        const mes = document.getElementById("filtro-fin-mes")?.value;
        const lbl = document.getElementById("fin-dash-periodo-label");
        if (lbl) {
            lbl.textContent = mes
                ? `Competência filtrada: ${mes} • ${lista.length} lançamento(s)`
                : `Todo o período • ${lista.length} lançamento(s)`;
        }

        const recsPagasList = lista.filter(
            (x) => x.tipo === "Receita" && x.status_pagamento === "Pago"
        );
        const ticketMedio =
            recsPagasList.length > 0 ? resumo.receitas_pagas / recsPagasList.length : 0;
        const margem =
            resumo.receitas_pagas > 0
                ? Math.round((resumo.saldo_liquido / resumo.receitas_pagas) * 100)
                : 0;
        const totalMovimentado =
            resumo.receitas_pagas + resumo.despesas + resumo.receitas_pendentes;

        const statsEl = document.getElementById("fin-dash-mini-stats");
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="fin-mini-stat">
                    <span>Margem Líquida</span>
                    <strong style="color:${margem >= 0 ? "#16a34a" : "#dc2626"};">${margem}%</strong>
                </div>
                <div class="fin-mini-stat">
                    <span>Ticket Médio (Vendas)</span>
                    <strong>${this.formatBRL(ticketMedio)}</strong>
                </div>
                <div class="fin-mini-stat">
                    <span>Total Movimentado</span>
                    <strong>${this.formatBRL(totalMovimentado)}</strong>
                </div>
                <div class="fin-mini-stat">
                    <span>Total de Registros</span>
                    <strong>${lista.length} lançamentos</strong>
                </div>
            `;
        }

        this._renderChart(
            "fin-chart-balanco",
            [
                { label: "Receitas Recebidas (Vendas)", valor: resumo.receitas_pagas, color: "#16a34a" },
                { label: "Despesas Pagas (Sorveteria)", valor: resumo.despesas, color: "#dc2626" },
                { label: "Valores Pendentes (Em Aberto)", valor: resumo.receitas_pendentes, color: "#f59e0b" },
            ],
            totalMovimentado,
            "#db2777"
        );

        const paletteDespesas = ["#ef4444", "#db2777", "#8b5cf6", "#f97316", "#0ea5e9", "#14b8a6", "#64748b"];
        const despMap = {};
        let totalDespGeral = 0;
        lista
            .filter((x) => x.tipo === "Despesa")
            .forEach((x) => {
                despMap[x.categoria] = (despMap[x.categoria] || 0) + Number(x.valor);
                totalDespGeral += Number(x.valor);
            });
        const despItems = Object.entries(despMap)
            .sort((a, b) => b[1] - a[1])
            .map(([label, valor], idx) => ({
                label,
                valor,
                color: paletteDespesas[idx % paletteDespesas.length],
            }));
        this._renderChart("fin-chart-despesas-cat", despItems, totalDespGeral, "#ef4444");
    },

    imprimirDashboardFinanceiro() {
        const printContent = document.getElementById("fin-dash-print-content");
        if (!printContent) return;
        const resumo = this._resumoFinanceiroCache || {};
        const periodoTexto = document.getElementById("fin-dash-periodo-label")?.textContent || "";
        const win = window.open("", "_blank", "width=950,height=780");
        win.document.write(`
            <html>
            <head>
                <title>Relatório Financeiro - Sorveteria Cone Mágico</title>
                <link rel="stylesheet" href="/static/css/style.css?v=1">
                <style>
                    body { background: #ffffff; padding: 30px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .no-print { display: none !important; }
                </style>
            </head>
            <body>
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #db2777; padding-bottom:15px; margin-bottom:22px;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <img src="/static/img/logo.svg" style="width:72px; height:72px;">
                        <div>
                            <h2 style="color:#db2777; margin:0;">Cone Mágico — Relatório & Dashboard Financeiro</h2>
                            <small style="color:#64748b;">Sorveteria & Gelateria Artesanal • ${periodoTexto}</small>
                        </div>
                    </div>
                </div>
                <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 1.5rem;">
                    <div class="kpi-card"><div class="kpi-label">Receitas Pagas</div><div class="kpi-value" style="color:#16a34a; font-size:1.3rem;">${this.formatBRL(resumo.receitas_pagas)}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Valores Pendentes</div><div class="kpi-value" style="color:#d97706; font-size:1.3rem;">${this.formatBRL(resumo.receitas_pendentes)}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Despesas Pagas</div><div class="kpi-value" style="color:#dc2626; font-size:1.3rem;">${this.formatBRL(resumo.despesas)}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Saldo Líquido</div><div class="kpi-value" style="font-size:1.3rem;">${this.formatBRL(resumo.saldo_liquido)}</div></div>
                </div>
                ${printContent.innerHTML}
                <script>setTimeout(() => window.print(), 300);</script>
            </body>
            </html>
        `);
        win.document.close();
    },

    // ==========================================
    // RELATÓRIO DE FLUXO DE CAIXA E BALANCETE SIMPLES
    // ==========================================
    toggleFluxoBalancete() {
        const box = document.getElementById("fin-fluxo-balancete-box");
        const btn = document.getElementById("btn-toggle-fluxo");
        if (!box) return;
        const abrir = box.style.display === "none";
        box.style.display = abrir ? "block" : "none";
        if (btn) {
            btn.textContent = abrir
                ? "📑 Ocultar Fluxo & Balancete"
                : "📑 Fluxo de Caixa & Balancete";
        }
        if (abrir) this.renderFluxoBalancete();
    },

    renderFluxoBalancete() {
        const lista = this._lancamentosCache || [];
        const mes = document.getElementById("filtro-fin-mes")?.value;
        const lbl = document.getElementById("fin-fluxo-periodo-label");
        if (lbl) {
            lbl.textContent = mes
                ? `Competência filtrada: ${mes} • ${lista.length} lançamento(s)`
                : `Todo o período • ${lista.length} lançamento(s)`;
        }

        const entradasMap = {};
        const saidasMap = {};
        let totalEntradasPagas = 0;
        let totalEntradasPendentes = 0;
        let totalSaidasPagas = 0;
        let totalSaidasPendentes = 0;

        lista.forEach((f) => {
            const val = Number(f.valor) || 0;
            const pago = f.status_pagamento === "Pago";
            const cat = f.categoria || "Sem Categoria";

            if (f.tipo === "Receita") {
                if (!entradasMap[cat]) entradasMap[cat] = { pago: 0, pendente: 0, total: 0 };
                if (pago) {
                    entradasMap[cat].pago += val;
                    totalEntradasPagas += val;
                } else {
                    entradasMap[cat].pendente += val;
                    totalEntradasPendentes += val;
                }
                entradasMap[cat].total += val;
            } else {
                if (!saidasMap[cat]) saidasMap[cat] = { pago: 0, pendente: 0, total: 0 };
                if (pago) {
                    saidasMap[cat].pago += val;
                    totalSaidasPagas += val;
                } else {
                    saidasMap[cat].pendente += val;
                    totalSaidasPendentes += val;
                }
                saidasMap[cat].total += val;
            }
        });

        const renderTabelaBalancete = (mapa, totalPago, totalPend, corTexto, msgVazia) => {
            const entries = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total);
            if (entries.length === 0) {
                return `<p style="font-size:0.86rem; color:#64748b; padding:0.75rem 0;">${msgVazia}</p>`;
            }
            const linhas = entries
                .map(
                    ([cat, v]) => `
                <tr>
                    <td style="padding:0.45rem 0.5rem;"><strong>${cat}</strong></td>
                    <td style="padding:0.45rem 0.5rem; text-align:right; color:${corTexto}; font-weight:600;">${this.formatBRL(v.pago)}</td>
                    <td style="padding:0.45rem 0.5rem; text-align:right; color:#d97706;">${this.formatBRL(v.pendente)}</td>
                    <td style="padding:0.45rem 0.5rem; text-align:right; font-weight:700;">${this.formatBRL(v.total)}</td>
                </tr>`
                )
                .join("");

            return `
                <table style="width:100%; font-size:0.84rem;">
                    <thead>
                        <tr style="border-bottom:1px solid #e2e8f0; color:#64748b;">
                            <th style="padding:0.4rem 0.5rem; text-align:left;">Categoria</th>
                            <th style="padding:0.4rem 0.5rem; text-align:right;">Realizado (Pago)</th>
                            <th style="padding:0.4rem 0.5rem; text-align:right;">Pendente</th>
                            <th style="padding:0.4rem 0.5rem; text-align:right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                    <tfoot>
                        <tr style="border-top:2px solid #cbd5e1; background:#f8fafc; font-weight:700;">
                            <td style="padding:0.55rem 0.5rem;">TOTAL</td>
                            <td style="padding:0.55rem 0.5rem; text-align:right; color:${corTexto};">${this.formatBRL(totalPago)}</td>
                            <td style="padding:0.55rem 0.5rem; text-align:right; color:#d97706;">${this.formatBRL(totalPend)}</td>
                            <td style="padding:0.55rem 0.5rem; text-align:right;">${this.formatBRL(totalPago + totalPend)}</td>
                        </tr>
                    </tfoot>
                </table>
            `;
        };

        const elEntradas = document.getElementById("balancete-entradas-body");
        if (elEntradas) {
            elEntradas.innerHTML = renderTabelaBalancete(
                entradasMap,
                totalEntradasPagas,
                totalEntradasPendentes,
                "#15803d",
                "Nenhuma entrada registrada neste período."
            );
        }

        const elSaidas = document.getElementById("balancete-saidas-body");
        if (elSaidas) {
            elSaidas.innerHTML = renderTabelaBalancete(
                saidasMap,
                totalSaidasPagas,
                totalSaidasPendentes,
                "#b91c1c",
                "Nenhuma saída/despesa registrada neste período."
            );
        }

        const saldoCaixaRealizado = totalEntradasPagas - totalSaidasPagas;
        const saldoProjetadoTotal =
            totalEntradasPagas + totalEntradasPendentes - (totalSaidasPagas + totalSaidasPendentes);

        const elResumo = document.getElementById("balancete-resumo-final");
        if (elResumo) {
            elResumo.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.85rem; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:1rem;">
                    <div>
                        <span style="display:block; font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Total Entradas Realizadas (+)</span>
                        <strong style="font-size:1.15rem; color:#15803d;">+ ${this.formatBRL(totalEntradasPagas)}</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Total Saídas Pagas (-)</span>
                        <strong style="font-size:1.15rem; color:#b91c1c;">- ${this.formatBRL(totalSaidasPagas)}</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Resultado / Lucro em Caixa (=)</span>
                        <strong style="font-size:1.25rem; color:${saldoCaixaRealizado >= 0 ? "#15803d" : "#dc2626"};">${this.formatBRL(saldoCaixaRealizado)}</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Saldo Projetado (c/ Pendentes)</span>
                        <strong style="font-size:1.1rem; color:#334155;">${this.formatBRL(saldoProjetadoTotal)}</strong>
                    </div>
                </div>
            `;
        }

        const tbodyFluxo = document.getElementById("fluxo-caixa-tbody");
        const tfootFluxo = document.getElementById("fluxo-caixa-tfoot");
        if (!tbodyFluxo || !tfootFluxo) return;

        if (lista.length === 0) {
            tbodyFluxo.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhuma movimentação financeira no período selecionado.</td></tr>`;
            tfootFluxo.innerHTML = "";
            return;
        }

        const cronologico = [...lista].sort((a, b) => {
            const da = a.data_pagamento || a.data_vencimento || "";
            const db = b.data_pagamento || b.data_vencimento || "";
            if (da !== db) return da.localeCompare(db);
            return (a.id || 0) - (b.id || 0);
        });

        let saldoAcumulado = 0;
        tbodyFluxo.innerHTML = cronologico
            .map((f) => {
                const val = Number(f.valor) || 0;
                const isReceita = f.tipo === "Receita";
                const isPago = f.status_pagamento === "Pago";

                if (isPago) {
                    saldoAcumulado += isReceita ? val : -val;
                }

                const dataRef = f.data_pagamento || f.data_vencimento;
                return `
                <tr style="${!isPago ? "opacity:0.78; background:#fffbeb;" : ""}">
                    <td>
                        <strong>${this.formatDateBR(dataRef)}</strong>
                        <br><small style="color:#64748b;">${f.forma_pagamento || "-"}</small>
                    </td>
                    <td>
                        <strong>${f.descricao}</strong>
                        ${f.cliente_nome ? `<br><small style="color:#64748b;">Cliente: ${f.cliente_nome}</small>` : `<br><small style="color:#7c3aed;">🍦 Sorveteria Cone Mágico</small>`}
                    </td>
                    <td><span class="badge badge-neutral">${f.categoria}</span></td>
                    <td>
                        <span class="badge ${isPago ? "badge-success" : "badge-warning"}">${f.status_pagamento}</span>
                    </td>
                    <td style="color:#15803d; font-weight:700;">
                        ${isReceita ? `+ ${this.formatBRL(val)}` : "—"}
                    </td>
                    <td style="color:#b91c1c; font-weight:700;">
                        ${!isReceita ? `- ${this.formatBRL(val)}` : "—"}
                    </td>
                    <td style="font-weight:700; color:${saldoAcumulado >= 0 ? "#0f172a" : "#dc2626"};">
                        ${isPago ? this.formatBRL(saldoAcumulado) : `<small style="color:#d97706;">(Aguardando baixa)</small>`}
                    </td>
                </tr>`;
            })
            .join("");

        tfootFluxo.innerHTML = `
            <tr style="background:#f1f5f9; border-top:2px solid #94a3b8; font-weight:700;">
                <td colspan="4" style="text-align:right; padding:0.75rem 1rem;">TOTAIS REALIZADOS NO CAIXA (QUITADOS):</td>
                <td style="color:#15803d; padding:0.75rem 1rem;">+ ${this.formatBRL(totalEntradasPagas)}</td>
                <td style="color:#b91c1c; padding:0.75rem 1rem;">- ${this.formatBRL(totalSaidasPagas)}</td>
                <td style="color:${saldoCaixaRealizado >= 0 ? "#15803d" : "#dc2626"}; font-size:1rem; padding:0.75rem 1rem;">= ${this.formatBRL(saldoCaixaRealizado)}</td>
            </tr>
        `;
    },

    imprimirFluxoBalancete() {
        const printContent = document.getElementById("fin-fluxo-print-content");
        if (!printContent) return;
        const periodoTexto = document.getElementById("fin-fluxo-periodo-label")?.textContent || "";
        const win = window.open("", "_blank", "width=1000,height=820");
        win.document.write(`
            <html>
            <head>
                <title>Fluxo de Caixa e Balancete - Sorveteria Cone Mágico</title>
                <link rel="stylesheet" href="/static/css/style.css?v=1">
                <style>
                    body { background: #ffffff; padding: 28px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .no-print { display: none !important; }
                </style>
            </head>
            <body>
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #7c3aed; padding-bottom:14px; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <img src="/static/img/logo.svg" style="width:70px; height:70px;">
                        <div>
                            <h2 style="color:#7c3aed; margin:0;">Cone Mágico — Relatório de Fluxo de Caixa & Balancete Simples</h2>
                            <small style="color:#64748b;">Sorveteria & Gelateria Artesanal • ${periodoTexto}</small>
                        </div>
                    </div>
                </div>
                ${printContent.innerHTML}
                <script>setTimeout(() => window.print(), 300);</script>
            </body>
            </html>
        `);
        win.document.close();
    },

    // ==========================================
    // 7. DESPESAS EXCLUSIVAS DA SORVETERIA (EXCLUSIVO ADMIN)
    // ==========================================
    async loadDespesasSorveteria() {
        const mes = document.getElementById("filtro-desp-mes")?.value || "";
        const cat = document.getElementById("filtro-desp-categoria")?.value || "";
        const status = document.getElementById("filtro-desp-status")?.value || "";

        const params = new URLSearchParams();
        params.set("tipo", "Despesa");
        if (mes) params.set("mes", mes);
        if (cat) params.set("categoria", cat);
        if (status) params.set("status_pagamento", status);

        const data = await this.api(`/api/financeiro?${params.toString()}`);
        const despesas = data.lancamentos || [];
        this._despesasSorveteriaCache = despesas;

        const pagas = despesas
            .filter((x) => x.status_pagamento === "Pago")
            .reduce((acc, x) => acc + Number(x.valor), 0);
        const pendentes = despesas
            .filter((x) => x.status_pagamento === "Pendente")
            .reduce((acc, x) => acc + Number(x.valor), 0);
        const total = pagas + pendentes;

        const catMap = {};
        despesas.forEach((x) => {
            catMap[x.categoria] = (catMap[x.categoria] || 0) + Number(x.valor);
        });
        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

        document.getElementById("desp-kpi-pagas").textContent = this.formatBRL(pagas);
        document.getElementById("desp-kpi-pendentes").textContent = this.formatBRL(pendentes);
        document.getElementById("desp-kpi-total").textContent = this.formatBRL(total);
        document.getElementById("desp-kpi-maior-cat").textContent =
            sortedCats.length > 0 ? sortedCats[0][0] : "Nenhuma";
        document.getElementById("desp-kpi-maior-valor").textContent =
            sortedCats.length > 0
                ? `${this.formatBRL(sortedCats[0][1])} no período`
                : "Sem despesas no período";

        const tbody = document.getElementById("despesas-sorveteria-tbody");
        if (!tbody) return;
        if (despesas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Nenhuma despesa da sorveteria registrada neste período.</td></tr>`;
            return;
        }

        tbody.innerHTML = despesas
            .map(
                (f) => `
            <tr>
                <td>
                    <strong>${this.formatDateBR(f.data_vencimento)}</strong>
                    ${f.data_pagamento ? `<br><small style="color:#16a34a;">Pago em ${this.formatDateBR(f.data_pagamento)}</small>` : ""}
                </td>
                <td><span class="badge badge-danger">🏢 ${f.categoria}</span></td>
                <td>
                    <strong>${f.descricao}</strong>
                    <br><small style="color:#64748b;">${f.observacoes || "Despesa Operacional Cone Mágico"}</small>
                </td>
                <td>${f.forma_pagamento}</td>
                <td><strong style="color:#b91c1c;">${this.formatBRL(f.valor)}</strong></td>
                <td>
                    <span class="badge ${f.status_pagamento === "Pago" ? "badge-success" : "badge-warning"}">${f.status_pagamento}</span>
                </td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        ${
                            f.status_pagamento === "Pendente"
                                ? `<button class="btn btn-sm btn-primary" onclick="App.quitarLancamento(${f.id})">✓ Dar Baixa</button>`
                                : ""
                        }
                        <button class="btn btn-sm btn-secondary" onclick="App.editarDespesaSorveteria(${f.id})">Editar</button>
                        <button class="btn btn-sm btn-danger" onclick="App.excluirLancamento(${f.id})">✕</button>
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    _opcoesCatReceita: `
        <optgroup label="Receitas da Sorveteria">
            <option value="Venda PDV">Venda PDV (Balcão / Mesa)</option>
            <option value="Encomenda / Evento">Encomenda / Festa / Evento</option>
            <option value="Delivery / App">Delivery / App</option>
            <option value="Suprimento / Troco de Caixa">Suprimento / Troco de Caixa</option>
            <option value="Outros">Outras Receitas</option>
        </optgroup>
    `,

    _opcoesCatDespesa: `
        <optgroup label="Despesas Operacionais (Sorveteria Cone Mágico)">
            <option value="Fornecedores / Laticínios & Polpas">Fornecedores / Laticínios & Polpas</option>
            <option value="Embalagens & Casquinhas">Embalagens & Casquinhas</option>
            <option value="Energia Elétrica (Freezers)">Energia Elétrica (Freezers)</option>
            <option value="Aluguel da Sorveteria">Aluguel da Sorveteria</option>
            <option value="Água & Saneamento">Água & Saneamento</option>
            <option value="Internet & Sistema">Internet & Sistema</option>
            <option value="Manutenção de Máquinas / Freezers">Manutenção de Máquinas / Freezers</option>
            <option value="Folha / Pagamento Funcionários">Folha / Pagamento Funcionários</option>
            <option value="Sangria / Despesa Rápida de Caixa">Sangria / Despesa Rápida de Caixa</option>
            <option value="Limpeza & Descartáveis">Limpeza & Descartáveis</option>
            <option value="Impostos / Contabilidade">Impostos / Contabilidade</option>
            <option value="Outros">Outras Despesas</option>
        </optgroup>
    `,

    openModalDespesaSorveteria() {
        document.getElementById("form-financeiro").reset();
        document.getElementById("fin-id").value = "";
        document.getElementById("modal-financeiro-titulo").textContent =
            "🏢 Nova Despesa da Sorveteria (Cone Mágico)";
        document.getElementById("fin-tipo").value = "Despesa";
        this.aoMudarTipoFinanceiro("Despesa", "Fornecedores / Laticínios & Polpas");
        document.getElementById("fin-vencimento").value = new Date().toISOString().slice(0, 10);
        document.getElementById("fin-status").value = "Pendente";
        document.getElementById("modal-financeiro").classList.add("open");
    },

    editarDespesaSorveteria(id) {
        const item = (this._despesasSorveteriaCache || []).find((x) => x.id === id);
        if (item) this.openModalFinanceiro(item);
    },

    aoMudarTipoFinanceiro(tipo, categoriaPreferida = null) {
        const rowCli = document.getElementById("fin-vinculo-cliente-row");
        if (rowCli) {
            rowCli.style.display = tipo === "Despesa" ? "none" : "grid";
        }
        const selectCat = document.getElementById("fin-categoria");
        const valorAnterior = categoriaPreferida || (selectCat ? selectCat.value : "");

        if (tipo === "Despesa") {
            document.getElementById("fin-cliente").value = "";
            if (selectCat) {
                selectCat.innerHTML = this._opcoesCatDespesa;
                const opcoesValidas = Array.from(selectCat.options).map((o) => o.value);
                selectCat.value = opcoesValidas.includes(valorAnterior)
                    ? valorAnterior
                    : "Fornecedores / Laticínios & Polpas";
            }
        } else {
            if (selectCat) {
                selectCat.innerHTML = this._opcoesCatReceita;
                const opcoesValidas = Array.from(selectCat.options).map((o) => o.value);
                selectCat.value = opcoesValidas.includes(valorAnterior)
                    ? valorAnterior
                    : "Venda PDV";
            }
        }
    },

    openModalFinanceiro(item = null) {
        document.getElementById("form-financeiro").reset();
        document.getElementById("fin-id").value = item ? item.id : "";
        document.getElementById("modal-financeiro-titulo").textContent = item
            ? `Editar Lançamento: ${item.descricao}`
            : "Novo Lançamento Financeiro";

        if (item) {
            const tipoItem = item.tipo || "Receita";
            document.getElementById("fin-tipo").value = tipoItem;
            this.aoMudarTipoFinanceiro(tipoItem, item.categoria);
            document.getElementById("fin-descricao").value = item.descricao || "";
            document.getElementById("fin-cliente").value = item.cliente_id || "";
            document.getElementById("fin-funcionario").value = item.funcionario_id || "";
            document.getElementById("fin-valor").value = item.valor || "";
            document.getElementById("fin-vencimento").value = item.data_vencimento || "";
            document.getElementById("fin-status").value = item.status_pagamento || "Pago";
            document.getElementById("fin-forma").value = item.forma_pagamento || "PIX";
        } else {
            document.getElementById("fin-tipo").value = "Receita";
            this.aoMudarTipoFinanceiro("Receita", "Venda PDV");
            document.getElementById("fin-vencimento").value = new Date().toISOString().slice(0, 10);
        }
        document.getElementById("modal-financeiro").classList.add("open");
    },

    editarLancamento(id) {
        const item = (this._lancamentosCache || []).find((x) => x.id === id);
        if (item) this.openModalFinanceiro(item);
    },

    async salvarFinanceiro() {
        try {
            const id = document.getElementById("fin-id").value;
            const tipo = document.getElementById("fin-tipo").value;
            const body = {
                tipo,
                categoria: document.getElementById("fin-categoria").value,
                descricao: document.getElementById("fin-descricao").value,
                cliente_id: tipo === "Despesa" ? null : document.getElementById("fin-cliente").value,
                funcionario_id: document.getElementById("fin-funcionario").value || null,
                valor: document.getElementById("fin-valor").value,
                data_vencimento: document.getElementById("fin-vencimento").value,
                status_pagamento: document.getElementById("fin-status").value,
                forma_pagamento: document.getElementById("fin-forma").value,
            };
            const url = id ? `/api/financeiro/${id}` : "/api/financeiro";
            const method = id ? "PUT" : "POST";
            const res = await this.api(url, { method, body: JSON.stringify(body) });
            this.toast(res.mensagem);
            this.closeModal("modal-financeiro");
            await this.loadFinanceiro();
            await this.loadDespesasSorveteria();
            await this.loadDashboard();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async quitarLancamento(id) {
        try {
            const res = await this.api(`/api/financeiro/${id}/pagar`, {
                method: "PATCH",
                body: JSON.stringify({ forma_pagamento: "PIX" }),
            });
            this.toast(res.mensagem);
            await this.loadFinanceiro();
            await this.loadDespesasSorveteria();
            await this.loadDashboard();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async excluirLancamento(id) {
        if (!confirm("Deseja excluir este lançamento financeiro?")) return;
        try {
            const res = await this.api(`/api/financeiro/${id}`, { method: "DELETE" });
            this.toast(res.mensagem);
            await this.loadFinanceiro();
            await this.loadDespesasSorveteria();
            await this.loadDashboard();
        } catch (e) {
            this.toast(e.message);
        }
    },

    emitirRecibo(id) {
        const item = (this._lancamentosCache || []).find((x) => x.id === id);
        if (!item) return;

        const win = window.open("", "_blank", "width=750,height=650");
        win.document.write(`
            <html>
            <head>
                <title>Recibo #${item.id} - Sorveteria Cone Mágico</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; line-height: 1.7; }
                    .recibo { border: 2px solid #db2777; padding: 35px; border-radius: 14px; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #fce7f3; padding-bottom: 15px; margin-bottom: 25px; }
                    .brand-recibo { display: flex; align-items: center; gap: 14px; }
                    .brand-recibo img { width: 75px; height: 75px; }
                    .valor-box { background: #fdf2f8; border: 1px solid #f472b6; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 20px; color: #be185d; }
                    .assinatura { margin-top: 55px; text-align: center; }
                </style>
            </head>
            <body>
                <div class="recibo">
                    <div class="header">
                        <div class="brand-recibo">
                            <img src="/static/img/logo.svg" alt="Cone Mágico">
                            <div>
                                <h2 style="margin:0; color:#db2777;">CONE MÁGICO • RECIBO Nº ${String(item.id).padStart(4, "0")}</h2>
                                <small>Sorveteria & Gelateria Artesanal</small>
                            </div>
                        </div>
                        <div class="valor-box">${this.formatBRL(item.valor)}</div>
                    </div>
                    <p>Recebemos de <strong>${item.cliente_nome || "Consumidor / Cliente"}</strong>, CPF nº <strong>${item.cliente_cpf || "___.___.___-__"}</strong>, a importância de <strong>${this.formatBRL(item.valor)}</strong>, referente a <strong>${item.descricao}</strong>.</p>
                    <p><strong>Forma de Pagamento:</strong> ${item.forma_pagamento} &nbsp;|&nbsp; <strong>Data da Quitação:</strong> ${this.formatDateBR(item.data_pagamento || item.data_vencimento)}</p>
                    <div class="assinatura">
                        _______________________________________________________<br>
                        <strong>Sorveteria Cone Mágico</strong><br>
                        Atendimento & Gestão Financeira
                    </div>
                </div>
                <script>setTimeout(() => window.print(), 250);</script>
            </body>
            </html>
        `);
        win.document.close();
    },

    // ==========================================
    // 8. EQUIPE & CONTROLE DE ACESSOS (ADMIN E FUNCIONÁRIO)
    // ==========================================
    async loadUsuarios() {
        this.usuarios = await this.api("/api/usuarios");
        this.renderUserSelect();
        this.renderQuickLoginAccounts();

        const optsFunc = this.usuarios
            .map((u) => `<option value="${u.id}">${u.nome} (${u.perfil === "admin" ? "ADMIN" : "Funcionário"})</option>`)
            .join("");
        const finFunc = document.getElementById("fin-funcionario");
        if (finFunc) {
            finFunc.innerHTML = `<option value="">-- Sorveteria Geral --</option>` + optsFunc;
        }

        const tbody = document.getElementById("usuarios-tbody");
        if (!tbody) return;
        tbody.innerHTML = this.usuarios
            .map(
                (u) => `
            <tr>
                <td><strong>${u.nome}</strong></td>
                <td>
                    <span class="badge ${u.perfil === "admin" ? "badge-warning" : "badge-pink"}">
                        ${u.perfil === "admin" ? "👑 ADMIN (Dono)" : "🍦 FUNCIONÁRIO"}
                    </span>
                </td>
                <td><code>${u.email}</code></td>
                <td>${u.cargo || "-"}</td>
                <td>${u.turno || "-"}</td>
                <td>${u.telefone || "-"}</td>
                <td>${u.perfil === "funcionario" ? this.formatBRL(u.salario_base) : "-"}</td>
                <td>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="App.editarUsuario(${u.id})">Editar</button>
                        <button class="btn btn-sm btn-danger" onclick="App.excluirUsuario(${u.id})">✕</button>
                    </div>
                </td>
            </tr>`
            )
            .join("");
    },

    openModalUsuario(usr = null) {
        document.getElementById("form-usuario").reset();
        document.getElementById("usr-id").value = usr ? usr.id : "";
        document.getElementById("modal-usuario-titulo").textContent = usr
            ? `Editar Acesso: ${usr.nome}`
            : "Cadastrar Colaborador / Acesso";

        if (usr) {
            document.getElementById("usr-nome").value = usr.nome || "";
            document.getElementById("usr-perfil").value = usr.perfil || "funcionario";
            document.getElementById("usr-cargo").value = usr.cargo || "";
            document.getElementById("usr-turno").value = usr.turno || "Integral";
            document.getElementById("usr-email").value = usr.email || "";
            document.getElementById("usr-senha").value = "";
            document.getElementById("usr-telefone").value = usr.telefone || "";
            document.getElementById("usr-salario").value = usr.salario_base || 1850;
        }
        document.getElementById("modal-usuario").classList.add("open");
    },

    editarUsuario(id) {
        const usr = this.usuarios.find((u) => u.id === id);
        if (usr) this.openModalUsuario(usr);
    },

    async salvarUsuario() {
        try {
            const id = document.getElementById("usr-id").value;
            const body = {
                id: id ? Number(id) : null,
                nome: document.getElementById("usr-nome").value,
                perfil: document.getElementById("usr-perfil").value,
                cargo: document.getElementById("usr-cargo").value,
                turno: document.getElementById("usr-turno").value,
                email: document.getElementById("usr-email").value,
                senha: document.getElementById("usr-senha").value,
                telefone: document.getElementById("usr-telefone").value,
                salario_base: document.getElementById("usr-salario").value,
            };
            const url = id ? `/api/usuarios/${id}` : "/api/usuarios";
            const method = id ? "PUT" : "POST";
            const res = await this.api(url, { method, body: JSON.stringify(body) });
            this.toast(res.mensagem);
            this.closeModal("modal-usuario");
            await this.loadUsuarios();
        } catch (e) {
            this.toast(e.message);
        }
    },

    async excluirUsuario(id) {
        if (!confirm("Deseja remover este colaborador da equipe ativa?")) return;
        try {
            const res = await this.api(`/api/usuarios/${id}`, { method: "DELETE" });
            this.toast(res.mensagem);
            await this.loadUsuarios();
        } catch (e) {
            this.toast(e.message);
        }
    },

    closeModal(id) {
        document.getElementById(id).classList.remove("open");
    },
};

window.addEventListener("DOMContentLoaded", () => App.init());
