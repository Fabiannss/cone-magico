/* Cone Mágico — desenhos coloridos dos produtos e nomes das categorias.
   Usado pelo cardápio digital (/pedir) e pelo painel (PDV e Cardápio). */
const ConeIlustra = (() => {
    // Ordem e nome de exibição das categorias (o valor gravado no banco é o "id")
    const CATEGORIAS = [
        { id: "Copo / Sundae", nome: "Taça ou Copo" },
        { id: "Casquinha / Cascão", nome: "Cascalho" },
        { id: "Milkshake", nome: "Milk-Shake" },
        { id: "Açaí e Cupuaçu", nome: "Açaí e Cupuaçu" },
        { id: "Picolé", nome: "Picolé" },
        { id: "Taças Especiais", nome: "Taças Especiais" },
        { id: "Pote / Viagem", nome: "Potes para viagem" },
        { id: "Bebidas", nome: "Bebidas" },
        { id: "Adicional / Calda", nome: "Adicionais" },
    ];

    const norm = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    // morango, chocolate, creme, pistache, uva
    const BOLAS = ["#f472b6", "#7c4a2d", "#fde68a", "#86efac", "#a78bfa"];
    const POS_TACA = {
        1: [[20, 19, 5.5]],
        2: [[15.5, 19, 5], [24.5, 19, 5]],
        3: [[15.5, 19.5, 5], [24.5, 19.5, 5], [20, 12.5, 5]],
        4: [[13.5, 20, 4.5], [20, 20, 4.5], [26.5, 20, 4.5], [20, 13, 4.5]],
        5: [[13.5, 20, 4.5], [20, 20, 4.5], [26.5, 20, 4.5], [16.5, 13, 4.5], [23.5, 13, 4.5]],
    };
    const POS_CONE = {
        1: [[20, 14, 6.5]],
        2: [[20, 15, 6], [20, 8, 5]],
        3: [[15.5, 15, 5.5], [24.5, 15, 5.5], [20, 8.5, 5]],
    };

    const bolas = (posicoes) =>
        posicoes.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${BOLAS[i % BOLAS.length]}"/>`).join("");

    const desenhos = {
        taca(n) {
            const k = Math.min(Math.max(n || 1, 1), 5);
            const cereja = k >= 3 ? `<circle cx="20" cy="6.5" r="2" fill="#ef4444"/>` : `<circle cx="20" cy="12.5" r="2" fill="#ef4444"/>`;
            return {
                fundo: "#fce7f3",
                svg: `${bolas(POS_TACA[k])}${cereja}<path d="M10 23h20l-3.5 11h-13z" fill="#f59e0b"/><path d="M13 27l14 4M27 27l-14 4" stroke="#b45309" stroke-width="1.2"/><path d="M9 23h22" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/>`,
            };
        },
        cone(n) {
            const k = Math.min(Math.max(n || 1, 1), 3);
            return {
                fundo: "#fef3c7",
                svg: `<path d="M12.5 20h15L20 37z" fill="#f59e0b"/><path d="M15 23l8 6M25 23l-8 6" stroke="#b45309" stroke-width="1.2"/>${bolas(POS_CONE[k])}<path d="M11.5 20h17" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/>`,
            };
        },
        acai(escala, toppings) {
            const pontos = [
                [16, 12, "#fde047"], [24, 12.5, "#ef4444"], [20, 9.5, "#ffffff"], [13.5, 14, "#d6a35c"],
                [26.5, 14.5, "#fde047"], [20, 13.5, "#86efac"], [17, 9, "#ef4444"], [23, 9, "#d6a35c"],
            ].slice(0, Math.min(Math.max(toppings || 2, 1), 8));
            const d = pontos.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${c}"/>`).join("");
            return {
                fundo: "#f3e8ff",
                svg: `<g transform="translate(20 34) scale(${escala}) translate(-20 -34)"><ellipse cx="20" cy="14" rx="9" ry="6" fill="#581c87"/><path d="M11 15h18l-2.5 19h-13z" fill="#7e22ce"/><path d="M12.5 22h15" stroke="#e9d5ff" stroke-width="2"/>${d}</g>`,
            };
        },
        picole(cor, fundo, extra) {
            return {
                fundo,
                svg: `<rect x="18.5" y="24" width="3" height="11" rx="1.5" fill="#d6a35c"/><rect x="13" y="5" width="14" height="22" rx="7" fill="${cor}"/>${extra || ""}`,
            };
        },
        milkshake(grande) {
            const e = grande ? 1 : 0.86;
            return {
                fundo: "#ffe4e6",
                svg: `<g transform="translate(20 35) scale(${e}) translate(-20 -35)"><path d="M26 3l-4 9" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/><path d="M11 14h18l-2.5 21h-13z" fill="#f9a8d4"/><path d="M12 22h16" stroke="#ffffff" stroke-width="2" opacity="0.7"/><ellipse cx="20" cy="13" rx="9.5" ry="4.5" fill="#fff7ed"/><circle cx="16.5" cy="10.5" r="3.5" fill="#fff7ed"/><circle cx="22" cy="9.5" r="4" fill="#fff7ed"/><circle cx="21" cy="6.5" r="1.8" fill="#ef4444"/></g>`,
            };
        },
        agua() {
            return {
                fundo: "#e0f2fe",
                svg: `<rect x="16.5" y="4" width="7" height="3.5" rx="1.2" fill="#0284c7"/><rect x="17.5" y="7" width="5" height="5" fill="#7dd3fc"/><rect x="13.5" y="11" width="13" height="25" rx="4.5" fill="#7dd3fc"/><rect x="13.5" y="19" width="13" height="7" fill="#ffffff"/><path d="M16.500 22.500h7" stroke="#0284c7" stroke-width="1.6" stroke-linecap="round"/>`,
            };
        },
        pote() {
            return {
                fundo: "#fef3c7",
                svg: `<path d="M9.500 16h21l-2 19h-17z" fill="#fde68a"/><rect x="7.500" y="11" width="25" height="6" rx="2.500" fill="#f472b6"/><circle cx="20" cy="26" r="4.500" fill="#f472b6"/>`,
            };
        },
        adicional() {
            return {
                fundo: "#fef3c7",
                svg: `<rect x="17" y="4" width="6" height="5" rx="1.500" fill="#b45309"/><path d="M14 13c0-2.500 2-4 6-4s6 1.500 6 4v19a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z" fill="#7c4a2d"/><rect x="14" y="18" width="12" height="8" fill="#fde68a"/>`,
            };
        },
    };

    function escolher(produto) {
        const nome = norm(produto && produto.nome);
        const cat = (produto && produto.categoria) || "";
        const numero = (regex, padrao) => {
            const m = nome.match(regex);
            return m ? parseInt(m[1], 10) : padrao;
        };

        if (nome.includes("acai") || nome.includes("cupuacu") || cat === "Açaí e Cupuaçu") {
            const ml = numero(/(\d+)\s*ml/, 0);
            const escala = ml && ml <= 180 ? 0.7 : ml && ml <= 300 ? 0.8 : ml && ml <= 400 ? 0.9 : 1;
            return desenhos.acai(escala, numero(/(\d+)\s*topping/, 2));
        }
        if (nome.includes("agua") || cat === "Bebidas") return desenhos.agua();
        if (nome.includes("milk") || cat === "Milkshake") return desenhos.milkshake(numero(/(\d+)\s*ml/, 400) >= 400);
        if (nome.includes("picole") || cat === "Picolé") {
            const calda = `<path d="M13 13c3 2 5-2 7 0s4 2 7 0" stroke="#fde68a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
            const brilho = `<path d="M17 9v5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`;
            if (/(tablito|brigadeiro|chicabon|chocolate)/.test(nome)) return desenhos.picole("#7c4a2d", "#fef3c7", calda);
            if (nome.includes("limao")) return desenhos.picole("#a3e635", "#ecfccb", brilho);
            if (nome.includes("uva")) return desenhos.picole("#a78bfa", "#ede9fe", brilho);
            if (nome.includes("morango")) return desenhos.picole("#fb7185", "#ffe4e6", brilho);
            return desenhos.picole("#fb7185", "#ffe4e6", `<path d="M13 15h14" stroke="#fde047" stroke-width="5"/>${brilho}`);
        }
        if (nome.includes("pote") || cat === "Pote / Viagem") return desenhos.pote();
        if (cat === "Adicional / Calda") return desenhos.adicional();
        if (nome.includes("cascalho") || nome.includes("casquinha") || nome.includes("cascao") || cat === "Casquinha / Cascão") {
            return desenhos.cone(numero(/(\d+)\s*(sabor|bola)/, 1));
        }
        if (cat === "Taças Especiais") return desenhos.taca(3);
        return desenhos.taca(numero(/(\d+)\s*(sabor|bola)/, 1));
    }

    function moldura(desenho, tamanho) {
        const t = tamanho || 44;
        return `<span class="ilu-produto" aria-hidden="true" style="width:${t}px;height:${t}px;border-radius:${Math.round(t * 0.32)}px;background:${desenho.fundo};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="${t}" height="${t}" viewBox="0 0 40 40">${desenho.svg}</svg></span>`;
    }

    const EXEMPLO = {
        "Copo / Sundae": { nome: "taça 3 sabores", categoria: "Copo / Sundae" },
        "Casquinha / Cascão": { nome: "cascalho 2 sabores", categoria: "Casquinha / Cascão" },
        "Milkshake": { nome: "milk-shake 400ml", categoria: "Milkshake" },
        "Açaí e Cupuaçu": { nome: "açaí 500ml 4 toppings", categoria: "Açaí e Cupuaçu" },
        "Picolé": { nome: "picolé", categoria: "Picolé" },
        "Taças Especiais": { nome: "taça", categoria: "Taças Especiais" },
        "Pote / Viagem": { nome: "pote", categoria: "Pote / Viagem" },
        "Bebidas": { nome: "água", categoria: "Bebidas" },
        "Adicional / Calda": { nome: "calda", categoria: "Adicional / Calda" },
    };

    return {
        CATEGORIAS,
        /** Desenho colorido do produto (HTML). */
        produto(produto, tamanho) {
            return moldura(escolher(produto), tamanho);
        },
        /** Desenho que representa a categoria (HTML). */
        categoria(idCategoria, tamanho) {
            return moldura(escolher(EXEMPLO[idCategoria] || { nome: "", categoria: idCategoria }), tamanho);
        },
        /** Nome de exibição da categoria. */
        nomeCategoria(idCategoria) {
            const c = CATEGORIAS.find((x) => x.id === idCategoria);
            return c ? c.nome : idCategoria;
        },
        /** Posição da categoria na ordem do cardápio. */
        ordemCategoria(idCategoria) {
            const i = CATEGORIAS.findIndex((x) => x.id === idCategoria);
            return i === -1 ? CATEGORIAS.length : i;
        },
    };
})();
