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

    // Cores das bolas: [base, sombra] — morango, chocolate, creme, pistache, uva
    const BOLAS = [["#fb7fb4", "#e4579a"], ["#8a5233", "#683a22"], ["#fff1b8", "#f3d266"], ["#9be7b0", "#5fcf85"], ["#b79cf7", "#8f6ee8"]];
    const f = (n) => Math.round(n * 100) / 100;

    // Mistura duas cores (t = quanto da segunda)
    function mistura(c1, c2, t) {
        const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        const [a, b] = [h(c1), h(c2)];
        return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
    }
    // Degradê que dá volume à bola (luz em cima à esquerda, sombra embaixo à direita)
    function volume(base, sombra) {
        const id = "cmg" + base.slice(1) + sombra.slice(1);
        return {
            id,
            def: `<radialGradient id="${id}" cx="0.34" cy="0.28" r="0.85"><stop offset="0" stop-color="${mistura(base, "#ffffff", 0.55)}"/><stop offset="0.5" stop-color="${base}"/><stop offset="1" stop-color="${sombra}"/></radialGradient>`,
        };
    }

    // Uma bola de sorvete com volume, babado na base e brilho
    function bola(x, y, r, i) {
        const [base, sombra] = BOLAS[i % BOLAS.length];
        const v = volume(base, sombra);
        return `<defs>${v.def}</defs><circle cx="${f(x - r * 0.55)}" cy="${f(y + r * 0.8)}" r="${f(r * 0.3)}" fill="${sombra}"/><circle cx="${f(x)}" cy="${f(y + r * 0.9)}" r="${f(r * 0.32)}" fill="${sombra}"/><circle cx="${f(x + r * 0.55)}" cy="${f(y + r * 0.8)}" r="${f(r * 0.3)}" fill="${sombra}"/>`
            + `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${v.id})"/>`
            + `<path d="M${f(x - r * 0.7)} ${f(y - r * 0.1)}c${f(r * 0.4)} ${f(-r * 0.45)} ${f(r * 0.9)} ${f(-r * 0.6)} ${f(r * 1.3)} ${f(-r * 0.35)}" stroke="${sombra}" stroke-width="${f(r * 0.1)}" fill="none" stroke-linecap="round" opacity="0.35"/>`
            + `<ellipse cx="${f(x - r * 0.36)}" cy="${f(y - r * 0.45)}" rx="${f(r * 0.3)}" ry="${f(r * 0.15)}" fill="#ffffff" opacity="0.7" transform="rotate(-32 ${f(x - r * 0.36)} ${f(y - r * 0.45)})"/>`;
    }
    const bolas = (posicoes) => posicoes.map(([x, y, r], i) => bola(x, y, r, i)).join("");
    const cereja = (x, y) => `<path d="M${x} ${y}c0-3 1.5-5 4-6" stroke="#15803d" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="2.6" fill="#e11d48"/><circle cx="${f(x - 0.9)}" cy="${f(y - 0.9)}" r="0.8" fill="#ffffff" opacity="0.7"/>`;
    const confeitos = (pontos) => pontos.map(([x, y, a, c]) => `<rect x="${x}" y="${y}" width="3" height="1.2" rx="0.6" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join("");

    const POS_TACA = {
        1: [[24, 18, 8.5]],
        2: [[17.5, 19.5, 7], [30.5, 19.5, 7]],
        3: [[17, 20.5, 6.6], [31, 20.5, 6.6], [24, 12.5, 6.8]],
        4: [[14.5, 21, 5.6], [24, 21, 5.6], [33.5, 21, 5.6], [24, 12.5, 6]],
        5: [[14.5, 21, 5.6], [24, 21, 5.6], [33.5, 21, 5.6], [19, 13, 5.6], [29, 13, 5.6]],
    };
    const POS_CONE = {
        1: [[24, 15.5, 9]],
        2: [[24, 17, 8], [24, 8.5, 6.4]],
        3: [[18.5, 17.5, 6.8], [29.5, 17.5, 6.8], [24, 9.5, 6.6]],
    };

    const desenhos = {
        taca(n) {
            const k = Math.min(Math.max(n || 1, 1), 5);
            const topo = k === 1 ? 9.5 : k === 2 ? 12.5 : k === 5 ? 9 : 5.8;
            return {
                fundo: "#fde4f1",
                svg: `<rect x="33" y="4" width="3.4" height="20" rx="1.2" fill="#e9b872" transform="rotate(18 34.7 14)"/><path d="M33.6 7l3 1M33.6 11l3 1M33.6 15l3 1" stroke="#c98f45" stroke-width="0.9" transform="rotate(18 34.7 14)"/>`
                    + bolas(POS_TACA[k]) + cereja(k === 2 ? 17.5 : 24, topo)
                    + `<path d="M8.500 25h31c0 8-6 13-15.500 13S8.500 33 8.500 25z" fill="#ffffff" opacity="0.62"/><path d="M8.500 25h31c0 8-6 13-15.500 13S8.500 33 8.500 25z" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 28.500c1 3 3 5 6 6" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="22.500" y="38" width="3" height="4.500" fill="#7dd3fc"/><rect x="15.500" y="42" width="17" height="3" rx="1.500" fill="#38bdf8"/>`,
            };
        },
        cone(n) {
            const k = Math.min(Math.max(n || 1, 1), 3);
            const topo = k === 1 ? 6 : 2.600;
            return {
                fundo: "#fff0cf",
                svg: `<path d="M14.500 25h19L24 46z" fill="#f2b65a"/><path d="M24 46l9.500-21h-5z" fill="#e09a3c"/><path d="M17 27l10.500 9M21 26l9 7.500M31 27l-10.500 9M27 26l-9 7.500M22 39l4-3.500M26 39l-4-3.500" stroke="#c57f28" stroke-width="1" stroke-linecap="round"/>`
                    + bolas(POS_CONE[k]) + cereja(24, topo + 2.600)
                    + confeitos(k === 1 ? [[19, 12, 20, "#ffffff"], [27, 10, -30, "#38bdf8"], [28, 17, 40, "#fde047"], [20, 18, -15, "#a78bfa"]] : [[20, 14, 20, "#ffffff"], [27, 15, -30, "#38bdf8"]])
                    + `<rect x="12.500" y="22.500" width="23" height="4.500" rx="2.250" fill="#f7cc82"/><rect x="12.500" y="25" width="23" height="2" rx="1" fill="#e09a3c" opacity="0.55"/>`,
            };
        },
        acai(escala, toppings) {
            const t = Math.min(Math.max(toppings || 2, 1), 8);
            const itens = [
                `<circle cx="17.500" cy="16" r="3.200" fill="#fff1b8"/><circle cx="17.500" cy="16" r="1.200" fill="#f3d266"/>`,
                `<path d="M27 12.500c2.800 0 4.300 1.700 4.300 3.600 0 2.400-2.300 4.200-4.300 5-2-0.800-4.300-2.600-4.300-5 0-1.900 1.500-3.600 4.300-3.600z" fill="#f43f5e"/><path d="M25.500 12.600l1.500-1.800 1.500 1.800" fill="#22c55e"/>`,
                `<circle cx="22.500" cy="12.500" r="2.800" fill="#fff1b8"/><circle cx="22.500" cy="12.500" r="1" fill="#f3d266"/>`,
                `<circle cx="13.500" cy="19.500" r="1.300" fill="#d6a35c"/><circle cx="20.500" cy="19" r="1.300" fill="#d6a35c"/><circle cx="33" cy="19.500" r="1.300" fill="#d6a35c"/>`,
                `<path d="M12.500 17.500c2 1.500 3-1 5 0.500s3 1 5-0.500 3-0.500 5 0.500 3 1 6-0.500" stroke="#ffffff" stroke-width="1.500" fill="none" stroke-linecap="round"/>`,
                `<circle cx="31.500" cy="14" r="2.400" fill="#7c4a2d"/>`,
                `<circle cx="13.500" cy="14.500" r="2" fill="#86efac"/>`,
                `<circle cx="27" cy="9.500" r="2" fill="#fde047"/>`,
            ].slice(0, t).join("");
            return {
                fundo: "#eee4ff",
                svg: `<g transform="translate(24 45) scale(${escala}) translate(-24 -45)"><rect x="34" y="3" width="2.600" height="20" rx="1.300" fill="#f472b6" transform="rotate(20 35 13)"/><ellipse cx="24" cy="19.500" rx="12.500" ry="6.500" fill="#4c1d95"/>${itens}<path d="M11 21h26l-2.600 21.500a2.500 2.500 0 0 1-2.500 2.200H16.100a2.500 2.500 0 0 1-2.500-2.200z" fill="#7c3aed"/><path d="M30 21h7l-2.600 21.500a2.500 2.500 0 0 1-2.500 2.200H29z" fill="#6d28d9"/><path d="M12.300 29h23.400l-0.800 7H13.100z" fill="#f5f3ff"/><circle cx="24" cy="32.500" r="2.300" fill="#7c3aed"/><path d="M15 24v4" stroke="#c4b5fd" stroke-width="1.500" stroke-linecap="round"/><rect x="10" y="19.500" width="28" height="3" rx="1.500" fill="#c4b5fd"/></g>`,
            };
        },
        picole(cor, sombra, fundo, extra) {
            return {
                fundo,
                svg: `<rect x="21.500" y="31" width="5" height="14.500" rx="2.500" fill="#e8c48e"/><rect x="24.500" y="33" width="2" height="12.500" rx="1" fill="#d1a566"/><rect x="13" y="3.500" width="22" height="31" rx="11" fill="${cor}"/><path d="M28 4.600A11 11 0 0 1 35 14.500v9a11 11 0 0 1-7 10.300z" fill="${sombra}" opacity="0.85"/>${extra || ""}<rect x="17" y="9" width="3.200" height="13" rx="1.600" fill="#ffffff" opacity="0.55"/><circle cx="33.500" cy="6" r="4.300" fill="${fundo}"/><circle cx="36.500" cy="11" r="2.600" fill="${fundo}"/>`,
            };
        },
        milkshake(grande) {
            const e = grande ? 1 : 0.86;
            return {
                fundo: "#ffe3ea",
                svg: `<g transform="translate(24 45) scale(${e}) translate(-24 -45)"><rect x="29" y="1" width="3.200" height="20" rx="1.600" fill="#ef4444" transform="rotate(16 30.600 11)"/><path d="M29 5l3.200 1M29 9.500l3.200 1M29 14l3.200 1" stroke="#ffffff" stroke-width="1.300" transform="rotate(16 30.600 11)"/><path d="M13.500 20h21l-2.300 22.500a2.500 2.500 0 0 1-2.500 2.200H18.300a2.500 2.500 0 0 1-2.500-2.200z" fill="#f9a8d4"/><path d="M28.500 20h6l-2.300 22.500a2.500 2.500 0 0 1-2.500 2.200H27.500z" fill="#f472b6"/><path d="M15 27c3 2 5-1.500 8 0s5 2 10-0.500M15.800 35c3 2 5-1.500 8 0s4 1.500 8.300-0.300" stroke="#fdf2f8" stroke-width="1.500" fill="none" stroke-linecap="round" opacity="0.9"/><path d="M17 23v6" stroke="#ffffff" stroke-width="1.600" stroke-linecap="round" opacity="0.8"/><circle cx="17" cy="17.500" r="4.500" fill="#fffdf5"/><circle cx="24" cy="15.500" r="5.500" fill="#fffdf5"/><circle cx="30.500" cy="17.500" r="4.500" fill="#fffdf5"/><circle cx="21.500" cy="11.500" r="4" fill="#fffdf5"/><path d="M14 20.500c4 1.500 16 1.500 20 0" stroke="#f3e3c3" stroke-width="1.300" fill="none" stroke-linecap="round"/>${cereja(21.500, 7.500)}<rect x="12" y="19.500" width="24" height="3" rx="1.500" fill="#fbcfe8"/></g>`,
            };
        },
        agua() {
            return {
                fundo: "#dff3ff",
                svg: `<rect x="19.500" y="3" width="9" height="4.500" rx="1.500" fill="#0369a1"/><rect x="21" y="7.500" width="6" height="4" fill="#7dd3fc"/><path d="M21 11.500h6c4 1.500 6 4 6 8v21a4.500 4.500 0 0 1-4.500 4.500h-9A4.500 4.500 0 0 1 15 40.500v-21c0-4 2-6.500 6-8z" fill="#7dd3fc"/><path d="M28 12c3.200 1.700 5 4 5 7.500v21a4.500 4.500 0 0 1-4.500 4.500H28z" fill="#38bdf8"/><rect x="15" y="22" width="18" height="10" fill="#ffffff"/><path d="M24 24.300c1.800 2 2.600 3.200 2.600 4.300a2.600 2.600 0 0 1-5.200 0c0-1.100 0.800-2.300 2.600-4.300z" fill="#0ea5e9"/><path d="M18 14.500v5M18 35v6" stroke="#ffffff" stroke-width="1.700" stroke-linecap="round" opacity="0.8"/>`,
            };
        },
        pote() {
            return {
                fundo: "#fff0cf",
                svg: `<path d="M10 19h28l-2.500 23.500a2.500 2.500 0 0 1-2.500 2.200H15a2.500 2.500 0 0 1-2.500-2.200z" fill="#fff7dc"/><path d="M31 19h7l-2.500 23.500a2.500 2.500 0 0 1-2.500 2.200H30z" fill="#fde9a8"/>${bola(24, 31, 6, 0)}<rect x="7.500" y="13" width="33" height="7" rx="3" fill="#fb7fb4"/><rect x="7.500" y="17" width="33" height="3" rx="1.500" fill="#e4579a"/><rect x="18" y="9" width="12" height="4.500" rx="2" fill="#e4579a"/>`,
            };
        },
        adicional() {
            return {
                fundo: "#fff0cf",
                svg: `<rect x="20" y="3" width="8" height="6" rx="2" fill="#b45309"/><path d="M16 15c0-3.500 3-5.500 8-5.500s8 2 8 5.500v26a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="#8a5233"/><path d="M28 10c2.500 0.800 4 2.500 4 5v26a4 4 0 0 1-4 4z" fill="#683a22"/><rect x="16" y="22" width="16" height="12" fill="#fff1b8"/>${bola(24, 28, 3.600, 0)}<path d="M19 13v5" stroke="#ffffff" stroke-width="1.600" stroke-linecap="round" opacity="0.6"/>`,
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
            const escala = ml && ml <= 180 ? 0.8 : ml && ml <= 300 ? 0.87 : ml && ml <= 400 ? 0.94 : 1;
            return desenhos.acai(escala, numero(/(\d+)\s*topping/, 2));
        }
        if (nome.includes("agua") || cat === "Bebidas") return desenhos.agua();
        if (nome.includes("milk") || cat === "Milkshake") return desenhos.milkshake(numero(/(\d+)\s*ml/, 400) >= 400);
        if (nome.includes("picole") || cat === "Picolé") {
            const cobertura = `<path d="M13 14.500A11 11 0 0 1 35 14.500v4.500c-1.800 2.200-3.700 2.200-5.500 0s-3.700-2.200-5.500 0-3.700 2.200-5.500 0-3.700-2.200-5.500 0z" fill="#683a22"/>` + confeitos([[17, 26, 20, "#fde047"], [25, 28, -30, "#ffffff"], [20, 31, 50, "#fb7fb4"], [28, 24, 10, "#86efac"]]);
            const faixa = (c) => `<path d="M13 22h22v1.500a11 11 0 0 1-22 0z" fill="${c}" opacity="0.9"/>`;
            if (/(tablito|brigadeiro|chicabon|chocolate)/.test(nome)) return desenhos.picole("#a9683f", "#8a5233", "#fff0cf", cobertura);
            if (nome.includes("limao")) return desenhos.picole("#bef264", "#a3e635", "#f1fbd5", faixa("#84cc16"));
            if (nome.includes("uva")) return desenhos.picole("#b79cf7", "#a78bfa", "#eee4ff", faixa("#8f6ee8"));
            if (nome.includes("morango")) return desenhos.picole("#fb8fa8", "#fb7185", "#ffe3ea", faixa("#f43f5e"));
            if (nome.includes("frutilly")) return desenhos.picole("#fdba74", "#fb923c", "#fff0e0", faixa("#f43f5e"));
            return desenhos.picole("#fb7fb4", "#f472b6", "#ffe3ea", `<path d="M13 16h22v8H13z" fill="#fff1b8"/><path d="M13 24h22v-0.500" stroke="#f3d266" stroke-width="0"/>`);
        }
        if (nome.includes("pote") || cat === "Pote / Viagem") return desenhos.pote();
        if (cat === "Adicional / Calda") return desenhos.adicional();
        if (nome.includes("cascalho") || nome.includes("casquinha") || nome.includes("cascao") || cat === "Casquinha / Cascão") {
            return desenhos.cone(numero(/(\d+)\s*(sabor|bola)/, 1));
        }
        if (cat === "Taças Especiais") return desenhos.taca(3);
        return desenhos.taca(numero(/(\d+)\s*(sabor|bola)/, 1));
    }

    // ---- Fotos ilustrativas (geradas por IA) ----
    const FOTOS = "/static/img/fotos/";
    const FOTO_SABOR = {
        "chocolate belga": "s-chocolate-belga", "chocolate trufado": "s-chocolate-trufado", "pistache": "s-pistache",
        "chocomenta": "s-chocomenta", "sonho de valsa": "s-sonho-de-valsa", "serenata": "s-serenata",
        "nutella": "s-nutella", "leite trufado": "s-leite-trufado", "leite condensado": "s-leite-condensado",
        "doce de leite": "s-doce-de-leite", "caramelo": "s-caramelo", "cookies": "s-cookies", "flocos": "s-flocos",
        "galaxy": "s-galaxy", "morango mesclado": "s-morango-mesclado", "grego com morango": "s-grego-com-morango",
        "amarena": "s-amarena",
    };
    function fotoProduto(produto) {
        const nome = norm(produto && produto.nome);
        const cat = (produto && produto.categoria) || "";
        if (nome.includes("acai") || nome.includes("cupuacu") || cat === "Açaí e Cupuaçu") return "p-acai";
        if (nome.includes("agua")) return "p-agua";
        if (nome.includes("milk") || cat === "Milkshake") return "p-milkshake";
        if (nome.includes("picole") || cat === "Picolé") {
            if (/(tablito|brigadeiro|chicabon|chocolate)/.test(nome)) return "p-picole-chocolate";
            if (/(limao|uva|morango|frutilly|fruttare)/.test(nome)) return "p-picole-fruta";
            return "p-picole-creme";
        }
        if (nome.includes("cascalho") || nome.includes("casquinha") || nome.includes("cascao") || cat === "Casquinha / Cascão") return "p-cone";
        if (cat === "Copo / Sundae" || nome.includes("taca") || nome.includes("copo")) return "p-taca";
        return null;
    }
    function molduraFoto(arquivo, tamanho) {
        const t = tamanho || 44;
        return `<span class="ilu-produto" aria-hidden="true" style="width:${t}px;height:${t}px;border-radius:${Math.round(t * 0.3)}px;background:#cfe6f5;box-shadow:inset 0 0 0 1px rgba(15,23,42,0.06);display:inline-flex;flex-shrink:0;overflow:hidden;"><img src="${FOTOS}${arquivo}.jpg" alt="" width="${t}" height="${t}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`;
    }

    function moldura(desenho, tamanho) {
        const t = tamanho || 44;
        return `<span class="ilu-produto" aria-hidden="true" style="width:${t}px;height:${t}px;border-radius:${Math.round(t * 0.3)}px;background:radial-gradient(circle at 28% 22%, #ffffff 0%, ${desenho.fundo} 62%);box-shadow:inset 0 0 0 1px rgba(15,23,42,0.06);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;"><svg width="${Math.round(t * 0.9)}" height="${Math.round(t * 0.9)}" viewBox="0 0 48 48">${desenho.svg}</svg></span>`;
    }

    // ---- Bola realista para cada sabor do cardápio ----
    // [trecho do nome, cor base, cor de sombra, detalhes...]  detalhe = [tipo, cor(es)]
    const SABORES_VISUAL = [
        ["chocolate belga", "#7a4526", "#3f1f0e", ["lascas", "#3a1c0c"]],
        ["chocolate trufado", "#5c3018", "#2b1206", ["calda", "#2b1206"], ["po", "#a9683f"]],
        ["pistache", "#7a4526", "#3f1f0e", ["calda", "#a8d36c"], ["lascas", "#c4e58f"]],
        ["chocomenta", "#aeeccb", "#5cc592", ["lascas", "#4a2613"]],
        ["sonho de valsa", "#ecd3ae", "#c79d68", ["calda", "#6b3a1e"], ["pedacos", ["#e11d74", "#6b3a1e"]]],
        ["serenata", "#ecd3ae", "#c79d68", ["calda", "#4a2613"], ["lascas", "#4a2613"]],
        ["nutella", "#fff6dc", "#ead9a4", ["calda", "#6b3a1e"]],
        ["leite trufado", "#fbeed0", "#e2cb92", ["lascas", "#4a2613"], ["po", "#7a4526"]],
        ["leite condensado", "#fff3cf", "#ecd58f", ["pedacos", ["#ef4444", "#22c55e", "#f59e0b"]]],
        ["doce de leite", "#dba566", "#a8703a", ["calda", "#9a5f2c"]],
        ["caramelo", "#e8b872", "#b8802f", ["calda", "#8a5a1f"], ["po", "#ffffff"]],
        ["cookies", "#f6f2e9", "#d9d0bd", ["lascas", "#2d2622"], ["pedacos", ["#2d2622", "#4b403a"]]],
        ["flocos", "#fffaf0", "#e6dcc3", ["lascas", "#4a2613"]],
        ["galaxy", "#6f6cf2", "#3b2fb0", ["calda", "#f472b6"], ["estrelas", "#ffffff"]],
        ["morango mesclado", "#ffb9d2", "#f277a6", ["calda", "#e11d48"]],
        ["grego com morango", "#fffdf5", "#e7e0cc", ["calda", "#e11d48"], ["pedacos", ["#e11d48"]]],
        ["amarena", "#fffdf5", "#e7e0cc", ["calda", "#7f1d3a"], ["pedacos", ["#5c0f27"]]],
        ["maracuja", "#ffd84f", "#e6a800", ["sementes", "#1f1408"]],
        ["abacaxi", "#ffe891", "#e9c33f", ["calda", "#8e2157"]],
        ["passas", "#f5e6c0", "#d8bf82", ["pedacos", ["#4a2030", "#5b2b1a"]]],
        ["acai", "#5b2a86", "#2f1150", ["calda", "#fff6dc"]],
        ["tucuma", "#f7a520", "#c96f06", ["po", "#fbd38d"]],
        ["tapioca", "#fffaf0", "#e6dcc3", ["perolas", "#ffffff"]],
        ["milho", "#ffe272", "#e3b420", ["pedacos", ["#f2b90f", "#fff3b0"]]],
        ["chiclete", "#74cdfb", "#2f9bd8", ["calda", "#f472b6"], ["pedacos", ["#ffffff", "#fde047"]]],
        ["alasca", "#fff3cf", "#ecd58f", ["pedacos", ["#dc2626", "#16a34a", "#5b2b1a"]]],
    ];
    const PONTOS = [[15, 17, 25], [27, 12, -20], [34, 22, 40], [20, 26, -35], [31, 29, 15], [12, 26, 60], [23, 19, 10], [28, 21, 75], [17, 31, -10]];
    const FORMA_BOLA = "M7 26C7 14 14.500 6 24 6s17 8 17 20c0 2-1 3.500-2.500 4 1 2.500-1.500 4.500-4 3.500-1 2.500-4.500 3-6 1-1.500 2.500-6 2.500-7.500 0-2 2-6 1.500-7-1-2.500 1-5.500-1-4.500-3.500C8 29.500 7 28 7 26z";

    function sabor(nome, tamanho) {
        const t = tamanho || 40;
        const n = norm(nome);
        const chaveFoto = Object.keys(FOTO_SABOR).find((k) => n.includes(k));
        if (chaveFoto) {
            return `<img class="ilu-sabor" aria-hidden="true" alt="" src="${FOTOS}${FOTO_SABOR[chaveFoto]}.jpg" width="${t}" height="${t}" loading="lazy" style="width:${t}px;height:${t}px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#cfe6f5;">`;
        }
        const cfg = SABORES_VISUAL.find((x) => n.includes(x[0])) || ["", "#fff1b8", "#e6c65a"];
        const [, base, sombra, ...detalhes] = cfg;
        const v = volume(base, sombra);
        const partes = detalhes.map(([tipo, cor]) => {
            if (tipo === "calda") {
                return `<path d="M5 21c6-8 12 4 19-2s10-7 19 0M7 30c6-5 10 3 16-1s10-5 18 1" stroke="${cor}" stroke-width="3.400" fill="none" stroke-linecap="round" opacity="0.92"/><path d="M5 21c6-8 12 4 19-2s10-7 19 0" stroke="#ffffff" stroke-width="0.800" fill="none" opacity="0.25" transform="translate(0 -1.200)"/>`;
            }
            if (tipo === "lascas") {
                return PONTOS.slice(0, 7).map(([x, y, a]) => `<path d="M0 0l3.600 0.700-0.900 2.700-3-0.900z" fill="${cor}" transform="translate(${x} ${y}) rotate(${a})"/>`).join("");
            }
            if (tipo === "pedacos") {
                return PONTOS.slice(2).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1.500 : 1.900}" fill="${cor[i % cor.length]}"/><circle cx="${f(x - 0.500)}" cy="${f(y - 0.500)}" r="0.500" fill="#ffffff" opacity="0.5"/>`).join("");
            }
            if (tipo === "sementes") {
                return PONTOS.map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="1.500" ry="0.900" fill="${cor}" transform="rotate(${a} ${x} ${y})"/>`).join("");
            }
            if (tipo === "perolas") {
                return PONTOS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.700" fill="${cor}" stroke="#cfc5ad" stroke-width="0.700"/>`).join("");
            }
            if (tipo === "po") {
                return PONTOS.map(([x, y]) => `<circle cx="${f(x + 2)}" cy="${f(y - 2)}" r="0.800" fill="${cor}" opacity="0.85"/><circle cx="${f(x - 2)}" cy="${f(y + 2)}" r="0.600" fill="${cor}" opacity="0.7"/>`).join("");
            }
            if (tipo === "estrelas") {
                return PONTOS.slice(0, 6).map(([x, y], i) => i % 2
                    ? `<circle cx="${x}" cy="${y}" r="0.900" fill="${cor}"/>`
                    : `<path d="M${x} ${y - 2.200}l0.700 1.500 1.500 0.700-1.500 0.700-0.700 1.500-0.700-1.500-1.500-0.700 1.500-0.700z" fill="${cor}"/>`).join("");
            }
            return "";
        }).join("");
        return `<svg class="ilu-sabor" aria-hidden="true" width="${t}" height="${t}" viewBox="0 0 48 44" style="flex-shrink:0;"><defs>${v.def}<clipPath id="cmsabclip"><path d="${FORMA_BOLA}"/></clipPath></defs>`
            + `<ellipse cx="24" cy="39.500" rx="15" ry="3" fill="#0f172a" opacity="0.13"/>`
            + `<path d="${FORMA_BOLA}" fill="url(#${v.id})"/>`
            + `<g clip-path="url(#cmsabclip)">`
            + `<path d="M6 28c8-3.500 26-3.500 36 0v12H6z" fill="${sombra}" opacity="0.28"/>`
            + `<path d="M11 19c4-6 11-9 19-7.500M10 25c7-3 18-4 28-1.500" stroke="${sombra}" stroke-width="1.100" fill="none" stroke-linecap="round" opacity="0.3"/>`
            + partes
            + `<ellipse cx="16" cy="13.500" rx="5.500" ry="2.500" fill="#ffffff" opacity="0.5" transform="rotate(-36 16 13.500)"/><circle cx="23.500" cy="9.500" r="1.100" fill="#ffffff" opacity="0.55"/>`
            + `</g></svg>`;
    }

    // Ícones pequenos e coloridos usados no lugar dos emojis
    const ICONES = {
        moto: `<rect x="2" y="7.500" width="7.500" height="6.500" rx="1.500" fill="#7dd3fc"/><path d="M4 10.700h3.500" stroke="#ffffff" stroke-width="1.200" stroke-linecap="round"/><path d="M6 17.500h7.500l3-7.500h2.500M15.500 5.500h3l1.700 6" stroke="#0369a1" stroke-width="2.200" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="17.500" r="3" fill="#ffffff" stroke="#075985" stroke-width="1.700"/><circle cx="19" cy="17.500" r="3" fill="#ffffff" stroke="#075985" stroke-width="1.700"/>`,
        loja: `<rect x="4.500" y="10" width="15" height="10.500" rx="1" fill="#e0f2fe"/><rect x="10" y="13.500" width="4.500" height="7" rx="0.800" fill="#0369a1"/><path d="M2.500 9l2.300-5.500h14.400L21.500 9z" fill="#7dd3fc"/><path d="M2.500 9a3.170 3.170 0 0 0 6.330 0 3.170 3.170 0 0 0 6.340 0 3.170 3.170 0 0 0 6.330 0z" fill="#bae6fd"/><path d="M8.830 9a3.170 3.170 0 0 0 6.340 0z" fill="#7dd3fc"/>`,
        pino: `<path d="M12 22.500s7.500-7.300 7.500-12.800a7.500 7.500 0 1 0-15 0c0 5.500 7.500 12.800 7.500 12.800z" fill="#0369a1"/><circle cx="12" cy="9.700" r="3" fill="#ffffff"/>`,
        sacola: `<path d="M4.500 8h15l-1.200 12.200a1.800 1.800 0 0 1-1.800 1.600h-9a1.800 1.800 0 0 1-1.800-1.600z" fill="#0369a1"/><path d="M8.500 11V7a3.500 3.500 0 0 1 7 0v4" stroke="#bae6fd" stroke-width="1.900" fill="none" stroke-linecap="round"/><circle cx="12" cy="15.500" r="2.400" fill="#7dd3fc"/>`,
        sorvete: `<path d="M7.500 12h9L12 22.500z" fill="#075985"/><circle cx="9.300" cy="9" r="3.800" fill="#7dd3fc"/><circle cx="14.700" cy="9" r="3.800" fill="#7dd3fc"/><circle cx="12" cy="5.300" r="3.600" fill="#bae6fd"/><rect x="6.500" y="11" width="11" height="2.200" rx="1.100" fill="#0c4a6e"/>`,
        presente: `<rect x="4" y="10.500" width="16" height="10.500" rx="1.500" fill="#7dd3fc"/><rect x="3" y="7" width="18" height="4.500" rx="1.200" fill="#7dd3fc"/><rect x="10.700" y="7" width="2.600" height="14" fill="#bae6fd"/><path d="M12 7C10 2.500 5.500 3.500 6.800 5.800S12 7 12 7zm0 0c2-4.500 6.500-3.500 5.200-1.200S12 7 12 7z" fill="#bae6fd"/>`,
        sino: `<path d="M12 3a6 6 0 0 0-6 6v4.200L4 17h16l-2-3.800V9a6 6 0 0 0-6-6z" fill="#0369a1"/><circle cx="12" cy="19.800" r="2.100" fill="#075985"/><path d="M9 6.500c0.600-1 1.500-1.600 2.500-1.800" stroke="#ffffff" stroke-width="1.300" fill="none" stroke-linecap="round" opacity="0.8"/>`,
        preparo: `<circle cx="8.500" cy="9" r="4.200" fill="#7dd3fc"/><circle cx="15.500" cy="9" r="4.200" fill="#bae6fd"/><circle cx="12" cy="5.800" r="3.500" fill="#7dd3fc"/><path d="M3.500 12h17a8.500 8.500 0 0 1-17 0z" fill="#0369a1"/><rect x="8.500" y="20" width="7" height="2.200" rx="1.100" fill="#0c4a6e"/>`,
        check: `<circle cx="12" cy="12" r="10" fill="#0369a1"/><path d="M7 12.500l3.300 3.300L17 9" stroke="#ffffff" stroke-width="2.500" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        alerta: `<path d="M12 3.500L21.500 20h-19z" fill="#0369a1" stroke="#0369a1" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.500v5" stroke="#ffffff" stroke-width="2.200" stroke-linecap="round"/><circle cx="12" cy="17.300" r="1.200" fill="#ffffff"/>`,
        mapa: `<path d="M3 6.500l6-2.500 6 2.500 6-2.500v13.500l-6 2.500-6-2.500-6 2.500z" fill="#e0f2fe"/><path d="M9 4v13.500M15 6.500V20" stroke="#0369a1" stroke-width="1.400"/><circle cx="15" cy="11" r="2.200" fill="#0369a1"/>`,
    };
    function icone(nome, tamanho) {
        const t = tamanho || 20;
        return `<svg class="ilu-icone" aria-hidden="true" width="${t}" height="${t}" viewBox="0 0 24 24" style="vertical-align:-0.22em;flex-shrink:0;">${ICONES[nome] || ""}</svg>`;
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
        /** Bola de sorvete realista do sabor (HTML). */
        sabor,
        /** Ícone pequeno colorido (HTML). */
        icone,
        /** Troca cada <span data-icone="nome"> da página pelo ícone desenhado. */
        aplicarIcones(raiz) {
            (raiz || document).querySelectorAll("[data-icone]").forEach((el) => {
                el.innerHTML = icone(el.dataset.icone, Number(el.dataset.tamanho) || 20);
            });
        },
        /** Desenho colorido do produto (HTML). */
        produto(produto, tamanho) {
            const foto = fotoProduto(produto);
            if (foto) return molduraFoto(foto, tamanho);
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
