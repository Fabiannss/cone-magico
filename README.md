# 🍦 CONE MÁGICO — Sistema de Gestão para Sorveteria & PDV

Aplicação Web completa em **Python + SQLite** (zero dependências externas, compatível nativamente com **Vercel Serverless**), baseada na arquitetura do **Psiquê Gestão**, adaptada exclusivamente para a sorveteria **CONE MÁGICO**.

---

## 🔐 Acesso

O sistema tem dois perfis: **ADMIN (Dono)**, com acesso total, e **FUNCIONÁRIO (Caixa)**, com acesso operacional (PDV, caixa rápido, cardápio, estoque e clientes, sem relatórios de lucro).

As senhas não ficam neste repositório. Troque as senhas iniciais em **Equipe** logo após o primeiro acesso.

---

## ✨ Módulos Incluídos

1. **🍦 PDV / Frente de Caixa Rápido**:
   - Catálogo visual separado por categorias (*Casquinhas & Cascões, Copos & Sundaes, Taças Especiais, Milkshakes, Picolés, Potes 2L, Adicionais & Caldas*).
   - Carrinho com cálculo automático, desconto, escolha de forma de pagamento (*PIX, Dinheiro, Cartão de Crédito/Débito, Resgate Fidelidade*) e impressão de **Cupom de Pedido**.
   - **💸 Sangria & Suprimento Rápido de Caixa**: O funcionário pode registrar pequenas despesas de balcão (ex: gelo, água, troco) que entram automaticamente no fluxo de caixa do Admin, sem que o funcionário visualize o lucro da loja.
2. **🎁 Clientes & Programa Fidelidade (10 Selos = 1 Sorvete Grátis)**:
   - Pontuação automática a cada compra vinculada ao cliente no PDV.
   - Cartão fidelidade visual com 10 selos (🍦) e botão de resgate de prêmio em 1 clique.
3. **🍨 Cardápio & Sabores + 📦 Controle de Estoque & Insumos**:
   - Cadastro de produtos e preços (Admin) e chaveamento rápido de sabor disponível/esgotado (Funcionário e Admin).
   - Monitoramento de insumos (*Bases Lácteas, Frutas Selecionadas, Casquinhas, Embalagens, Caldas*) com **Alerta Automático de Estoque Mínimo**.
4. **💰 Financeiro Completo, Gráficos (Pizza/Barras), Fluxo de Caixa & Balancete (Exclusivo Admin)**:
   - Dashboard Financeiro interativo com gráficos em **Pizza** e **Barras** prontos para impressão/PDF.
   - **Balancete Simples (Entradas x Saídas por Categoria)** e **Demonstrativo de Fluxo de Caixa Cronológico** com saldo acumulado.
   - Controle dedicado de **Despesas da Sorveteria** (*Fornecedores de Laticínios/Polpas, Energia dos Freezers, Aluguel, Embalagens, Manutenção, Folha e Sangrias*).
