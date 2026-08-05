    function getOperationalStorageKey(baseKey) {
      let branch = null;
      let user = null;
      try {
        branch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
        user = JSON.parse(sessionStorage.getItem("nextstockAuthenticatedUser") || "null");
      } catch {
        branch = null;
        user = null;
      }
      return [
        baseKey,
        branch?.tenantId || "no-tenant",
        branch?.id || "no-branch",
        user?.id || "anonymous"
      ].join(":");
    }

    const STORAGE_KEYS = {
      reciboPendente: getOperationalStorageKey("nextstockReciboPendente"),
      notaFiscalPendente: getOperationalStorageKey("nextstockNotaFiscalPendente"),
      ultimaVendaPaga: getOperationalStorageKey("nextstockUltimaVendaPaga")
    };

    const produtosCatalogo = {
      "789001": {
        codigoBarra: "789001",
        nome: "Ração Premium 10kg",
        precoUnitario: 189.90,
        tipoVenda: "unidade"
      },
      "789002": {
        codigoBarra: "789002",
        nome: "Shampoo Pet Neutro",
        precoUnitario: 24.50,
        tipoVenda: "unidade"
      },
      "789003": {
        codigoBarra: "789003",
        nome: "Petisco a granel",
        precoUnitario: 72.90,
        tipoVenda: "granel"
      },
      "789004": {
        codigoBarra: "789004",
        nome: "Ração a granel",
        precoUnitario: 28.90,
        tipoVenda: "granel"
      }
    };

    const produtosVenda = [];

    const vendaAtual = {
      paga: false,
      formaPagamento: "",
      maquininha: "",
      valorPago: 0,
      troco: 0,
      faltante: 0,
      dataPagamento: null,
      descontoTipo: "percentual",
      descontoValor: 0,
      reciboSolicitado: false,
      notaFiscalEnviada: false
    };

    const productList = document.getElementById("productList");
    const emptyState = document.getElementById("emptyState");
    const barcodeInput = document.getElementById("barcodeInput");
    const searchProductInput = document.getElementById("searchProductInput");

    const totalVendaEl = document.getElementById("totalVenda");
    const totalPagoEl = document.getElementById("totalPago");
    const trocoVendaEl = document.getElementById("trocoVenda");
    const statusVendaEl = document.getElementById("statusVenda");

    const pagarBtn = document.getElementById("pagarBtn");
    const descontoBtn = document.getElementById("descontoBtn");
    const cancelarVendaBtn = document.getElementById("cancelarVendaBtn");
    const notaFiscalBtn = document.getElementById("notaFiscalBtn");
    const reciboBtn = document.getElementById("reciboBtn");
    const fecharCaixaBtn = document.getElementById("fecharCaixaBtn");
    const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");

    const paymentOverlay = document.getElementById("paymentOverlay");
    const closePaymentModal = document.getElementById("closePaymentModal");
    const cancelarPagamentoBtn = document.getElementById("cancelarPagamentoBtn");
    const pagoBtn = document.getElementById("pagoBtn");
    const paymentMethod = document.getElementById("paymentMethod");
    const paymentValue = document.getElementById("paymentValue");
    const machineField = document.getElementById("machineField");
    const cardMachine = document.getElementById("cardMachine");

    const modalTotalVenda = document.getElementById("modalTotalVenda");
    const modalTotalPago = document.getElementById("modalTotalPago");
    const modalTroco = document.getElementById("modalTroco");
    const modalFaltante = document.getElementById("modalFaltante");

    const discountOverlay = document.getElementById("discountOverlay");
    const closeDiscountModal = document.getElementById("closeDiscountModal");
    const cancelDiscountBtn = document.getElementById("cancelDiscountBtn");
    const applyDiscountBtn = document.getElementById("applyDiscountBtn");
    const removeDiscountBtn = document.getElementById("removeDiscountBtn");
    const discountType = document.getElementById("discountType");
    const discountValue = document.getElementById("discountValue");

    const toastContainer = document.getElementById("toastContainer");
    const printArea = document.getElementById("printArea");

    function sanitizarEntrada(valor) {
      return String(valor)
        .trim()
        .replace(/[\0\x08\x09\x1a\n\r"'\\;%]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 120);
    }

    function formatarMoeda(valor) {
      return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function formatarQuantidade(produto) {
      if (produto.tipoVenda === "granel") {
        return `${Number(produto.quantidade).toFixed(3).replace(".", ",")} kg`;
      }

      return `${Number(produto.quantidade)} un.`;
    }

    function mostrarToast(mensagem, tipo = "info") {
      const toast = document.createElement("div");
      toast.className = `toast ${tipo}`;
      toast.textContent = mensagem;

      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 4200);
    }

    function calcularSubtotalVenda() {
      return produtosVenda.reduce((acc, item) => {
        return acc + item.quantidade * item.precoUnitario;
      }, 0);
    }

    function calcularDesconto() {
      const subtotal = calcularSubtotalVenda();
      const valor = Number(vendaAtual.descontoValor || 0);

      if (valor <= 0) return 0;

      if (vendaAtual.descontoTipo === "percentual") {
        return Math.min(subtotal * (valor / 100), subtotal);
      }

      return Math.min(valor, subtotal);
    }

    function calcularTotalVenda() {
      return Math.max(calcularSubtotalVenda() - calcularDesconto(), 0);
    }

    function calcularTotaisPagamento() {
      const totalVenda = calcularTotalVenda();
      const totalPago = Number(paymentValue.value || 0);
      const troco = Math.max(totalPago - totalVenda, 0);
      const faltante = Math.max(totalVenda - totalPago, 0);

      return { totalVenda, totalPago, troco, faltante };
    }

    function resetarPagamento() {
      vendaAtual.paga = false;
      vendaAtual.formaPagamento = "";
      vendaAtual.maquininha = "";
      vendaAtual.valorPago = 0;
      vendaAtual.troco = 0;
      vendaAtual.faltante = 0;
      vendaAtual.dataPagamento = null;
      vendaAtual.reciboSolicitado = false;
      vendaAtual.notaFiscalEnviada = false;
    }

    function atualizarResumoPrincipal() {
      const total = calcularTotalVenda();

      totalVendaEl.textContent = formatarMoeda(total);
      totalPagoEl.textContent = formatarMoeda(vendaAtual.valorPago);
      trocoVendaEl.textContent = formatarMoeda(vendaAtual.troco);

      if (produtosVenda.length === 0) {
        statusVendaEl.innerHTML = `
          <strong>Status da venda</strong>
          Nenhuma compra em andamento.
        `;
        return;
      }

      if (vendaAtual.paga) {
        const pagamento = vendaAtual.formaPagamento || "não informado";
        const maquina = vendaAtual.maquininha ? `<br>Maquininha: ${vendaAtual.maquininha}` : "";

        statusVendaEl.innerHTML = `
          <strong>Status da venda</strong>
          Venda paga com sucesso.<br>
          Forma: ${pagamento}.${maquina}
        `;
        return;
      }

      statusVendaEl.innerHTML = `
        <strong>Status da venda</strong>
        Compra em andamento. Total pendente: ${formatarMoeda(total)}.
      `;
    }

    function atualizarResumoModal() {
      const { totalVenda, totalPago, troco, faltante } = calcularTotaisPagamento();

      modalTotalVenda.textContent = formatarMoeda(totalVenda);
      modalTotalPago.textContent = formatarMoeda(totalPago);
      modalTroco.textContent = formatarMoeda(troco);
      modalFaltante.textContent = formatarMoeda(faltante);
    }

    function atualizarTotalLinha(index) {
      const item = produtosVenda[index];
      item.total = item.quantidade * item.precoUnitario;
    }

    function removerProdutoSeQuantidadeZero(index) {
      const produto = produtosVenda[index];

      if (!produto) return;

      if (produto.tipoVenda === "granel") {
        if (produto.quantidade < 0.050) {
          produtosVenda.splice(index, 1);
        }
      } else {
        if (produto.quantidade <= 0) {
          produtosVenda.splice(index, 1);
        }
      }
    }

    function renderizarLista() {
      productList.innerHTML = "";

      if (produtosVenda.length === 0) {
        productList.appendChild(emptyState);
        emptyState.style.display = "flex";
        atualizarResumoPrincipal();
        return;
      }

      emptyState.style.display = "none";

      produtosVenda.forEach((produto, index) => {
        atualizarTotalLinha(index);

        const isGranel = produto.tipoVenda === "granel";
        const step = isGranel ? "0.050" : "1";
        const min = isGranel ? "0.050" : "0";
        const max = isGranel ? "1000.000" : "9999";
        const value = isGranel ? Number(produto.quantidade).toFixed(3) : Number(produto.quantidade);

        const row = document.createElement("div");
        row.className = "item";

        row.innerHTML = `
          <div class="produto-info">
            <div class="produto-nome">${produto.nome}</div>
            <div class="produto-codigo">Código: ${produto.codigoBarra}</div>
            <div class="produto-tipo">
              ${isGranel ? "Venda por granel - mínimo 0,050kg" : "Venda por unidade"}
            </div>
          </div>

          <div class="precoUnidade">
            ${formatarMoeda(produto.precoUnitario)}
            <small>${isGranel ? "/ kg" : "/ un."}</small>
          </div>

          <div class="controle-qtd">
            <button class="btnLista" type="button" data-action="decrement" data-index="${index}">-</button>
            <input
              type="number"
              class="qtdInput ${isGranel ? "granel" : ""}"
              min="${min}"
              max="${max}"
              step="${step}"
              value="${value}"
              data-action="manual"
              data-index="${index}"
            >
            <button class="btnLista" type="button" data-action="increment" data-index="${index}">+</button>
          </div>

          <input
            type="text"
            class="totalLinha"
            value="${formatarMoeda(produto.total)}"
            readonly
          >
        `;

        productList.appendChild(row);
      });

      atualizarResumoPrincipal();
    }

    function adicionarProdutoPorCodigo(codigoBarra) {
      const codigo = sanitizarEntrada(codigoBarra);

      if (!codigo) return;

      const produtoCatalogo = produtosCatalogo[codigo];

      if (!produtoCatalogo) {
        mostrarToast("Produto não encontrado. Cadastre ou integre esse item ao estoque.", "warning");
        return;
      }

      const existente = produtosVenda.find(item => item.codigoBarra === codigo);

      if (existente) {
        if (existente.tipoVenda === "granel") {
          existente.quantidade = Math.min(Number(existente.quantidade) + 0.050, 1000);
        } else {
          existente.quantidade += 1;
        }

        resetarPagamento();
        renderizarLista();
        return;
      }

      produtosVenda.push({
        codigoBarra: sanitizarEntrada(produtoCatalogo.codigoBarra),
        nome: sanitizarEntrada(produtoCatalogo.nome),
        precoUnitario: Number(produtoCatalogo.precoUnitario),
        tipoVenda: produtoCatalogo.tipoVenda,
        quantidade: produtoCatalogo.tipoVenda === "granel" ? 0.050 : 1,
        total: Number(produtoCatalogo.precoUnitario)
      });

      resetarPagamento();
      renderizarLista();
    }

    function pesquisarProdutoNoEstoque(termo) {
      const valorPesquisa = sanitizarEntrada(termo).toLowerCase();

      if (!valorPesquisa) return;

      const produtoEncontrado = Object.values(produtosCatalogo).find(produto => {
        return produto.nome.toLowerCase().includes(valorPesquisa) ||
          produto.codigoBarra.toLowerCase().includes(valorPesquisa);
      });

      if (!produtoEncontrado) {
        mostrarToast("Produto não encontrado na lista de exemplo.", "warning");
        return;
      }

      adicionarProdutoPorCodigo(produtoEncontrado.codigoBarra);
    }

    function abrirModalPagamento() {
      if (produtosVenda.length === 0) {
        mostrarToast("Adicione produtos antes de iniciar o pagamento.", "warning");
        return;
      }

      paymentValue.value = calcularTotalVenda().toFixed(2);
      paymentMethod.value = "dinheiro";
      cardMachine.value = "";
      machineField.style.display = "none";

      atualizarResumoModal();
      paymentOverlay.classList.add("open");
    }

    function fecharModalPagamento() {
      paymentOverlay.classList.remove("open");
    }

    function atualizarCampoMaquininha() {
      const metodo = paymentMethod.value;

      if (metodo === "debito" || metodo === "credito") {
        machineField.style.display = "flex";
      } else {
        machineField.style.display = "none";
        cardMachine.value = "";
      }

      atualizarResumoModal();
    }

    function gerarPayloadVenda() {
      const subtotal = calcularSubtotalVenda();
      const desconto = calcularDesconto();
      const total = calcularTotalVenda();

      return {
        vendaId: `VENDA-${Date.now()}`,
        criadaEm: new Date().toISOString(),
        paga: vendaAtual.paga,
        produtos: produtosVenda.map(produto => ({
          codigoBarra: produto.codigoBarra,
          nome: produto.nome,
          tipoVenda: produto.tipoVenda,
          quantidade: produto.quantidade,
          quantidadeFormatada: formatarQuantidade(produto),
          precoUnitario: produto.precoUnitario,
          total: produto.total
        })),
        desconto: {
          tipo: vendaAtual.descontoTipo,
          valorInformado: vendaAtual.descontoValor,
          valorAplicado: desconto
        },
        totais: {
          subtotal,
          desconto,
          total,
          valorPago: vendaAtual.valorPago,
          troco: vendaAtual.troco,
          faltante: vendaAtual.faltante
        },
        pagamento: {
          forma: vendaAtual.formaPagamento,
          maquininha: vendaAtual.maquininha
        }
      };
    }

    function concluirPagamento() {
      if (produtosVenda.length === 0) {
        mostrarToast("Não há itens na venda.", "warning");
        return;
      }

      const metodo = paymentMethod.value;
      const isCartao = metodo === "debito" || metodo === "credito";

      if (isCartao && !cardMachine.value) {
        mostrarToast("Selecione a maquininha usada no cartão.", "warning");
        return;
      }

      const { totalVenda, totalPago, troco, faltante } = calcularTotaisPagamento();

      if (totalPago <= 0) {
        mostrarToast("Informe o valor pago.", "warning");
        return;
      }

      if (faltante > 0) {
        mostrarToast("O valor pago é menor que o total da compra.", "error");
        return;
      }

      vendaAtual.formaPagamento = metodo;
      vendaAtual.maquininha = isCartao ? cardMachine.value : "";
      vendaAtual.valorPago = totalPago;
      vendaAtual.troco = troco;
      vendaAtual.faltante = faltante;
      vendaAtual.paga = true;
      vendaAtual.dataPagamento = new Date().toISOString();

      const payload = gerarPayloadVenda();
      sessionStorage.setItem(STORAGE_KEYS.ultimaVendaPaga, JSON.stringify(payload));

      atualizarResumoPrincipal();
      fecharModalPagamento();
      imprimirRecibo(payload);

      mostrarToast("Pagamento realizado. Recibo enviado para impressão.", "success");
    }

    function imprimirRecibo(payload) {
      const formaPagamento = {
        dinheiro: "Dinheiro",
        pix: "PIX",
        debito: "Cartão de débito",
        credito: "Cartão de crédito"
      }[payload.pagamento.forma] || payload.pagamento.forma;

      const linhasProdutos = payload.produtos.map(produto => `
        <tr>
          <td>${produto.nome}</td>
          <td>${produto.quantidadeFormatada}</td>
          <td>${formatarMoeda(produto.precoUnitario)}</td>
          <td>${formatarMoeda(produto.total)}</td>
        </tr>
      `).join("");

      printArea.innerHTML = `
        <div>
          <h2>NextStock - Recibo de Venda</h2>
          <p><strong>Venda:</strong> ${payload.vendaId}</p>
          <p><strong>Data:</strong> ${new Date(payload.criadaEm).toLocaleString("pt-BR")}</p>
          <p><strong>Pagamento:</strong> ${formaPagamento}</p>
          ${payload.pagamento.maquininha ? `<p><strong>Maquininha:</strong> ${payload.pagamento.maquininha}</p>` : ""}

          <hr>

          <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="8">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd/KG</th>
                <th>Unitário</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${linhasProdutos}
            </tbody>
          </table>

          <hr>

          <p><strong>Subtotal:</strong> ${formatarMoeda(payload.totais.subtotal)}</p>
          <p><strong>Desconto:</strong> ${formatarMoeda(payload.totais.desconto)}</p>
          <p><strong>Total:</strong> ${formatarMoeda(payload.totais.total)}</p>
          <p><strong>Valor pago:</strong> ${formatarMoeda(payload.totais.valorPago)}</p>
          <p><strong>Troco:</strong> ${formatarMoeda(payload.totais.troco)}</p>
        </div>
      `;

      printArea.style.display = "block";
      window.print();
      printArea.style.display = "none";
    }

    function abrirModalDesconto() {
      if (produtosVenda.length === 0) {
        mostrarToast("Adicione produtos antes de aplicar desconto.", "warning");
        return;
      }

      discountType.value = vendaAtual.descontoTipo;
      discountValue.value = vendaAtual.descontoValor || "";
      discountOverlay.classList.add("open");
    }

    function fecharModalDesconto() {
      discountOverlay.classList.remove("open");
    }

    function aplicarDesconto() {
      const tipo = discountType.value;
      const valor = Number(discountValue.value || 0);

      if (valor < 0) {
        mostrarToast("Informe um desconto válido.", "warning");
        return;
      }

      if (tipo === "percentual" && valor > 100) {
        mostrarToast("O desconto percentual não pode passar de 100%.", "warning");
        return;
      }

      vendaAtual.descontoTipo = tipo;
      vendaAtual.descontoValor = valor;

      resetarPagamento();
      atualizarResumoPrincipal();
      fecharModalDesconto();

      mostrarToast("Desconto aplicado ao total da compra.", "success");
    }

    function removerDesconto() {
      vendaAtual.descontoTipo = "percentual";
      vendaAtual.descontoValor = 0;

      resetarPagamento();
      atualizarResumoPrincipal();
      fecharModalDesconto();

      mostrarToast("Desconto removido.", "info");
    }

    function limparCompra() {
      if (produtosVenda.length === 0) {
        mostrarToast("Não há compra para cancelar.", "info");
        return;
      }

      const confirmar = window.confirm("Deseja realmente limpar a compra atual?");
      if (!confirmar) return;

      produtosVenda.splice(0, produtosVenda.length);

      vendaAtual.descontoTipo = "percentual";
      vendaAtual.descontoValor = 0;

      resetarPagamento();

      sessionStorage.removeItem(STORAGE_KEYS.reciboPendente);
      sessionStorage.removeItem(STORAGE_KEYS.notaFiscalPendente);
      sessionStorage.removeItem(STORAGE_KEYS.ultimaVendaPaga);

      renderizarLista();
      mostrarToast("Compra cancelada e limpa com sucesso.", "info");
    }

    function solicitarRecibo() {
      if (produtosVenda.length === 0) {
        mostrarToast("Não há venda para gerar recibo.", "warning");
        return;
      }

      if (!vendaAtual.paga) {
        mostrarToast("Pague a venda antes de gerar o recibo.", "warning");
        return;
      }

      const payload = {
        tipo: "recibo",
        acao: "gerar-recibo",
        ...gerarPayloadVenda()
      };

      vendaAtual.reciboSolicitado = true;
      sessionStorage.setItem(STORAGE_KEYS.reciboPendente, JSON.stringify(payload));

      imprimirRecibo(payload);
      mostrarToast("Recibo gerado para impressão.", "success");
      atualizarResumoPrincipal();
    }

    function enviarParaNotaFiscal() {
      if (produtosVenda.length === 0) {
        mostrarToast("Não há venda para enviar à nota fiscal.", "warning");
        return;
      }

      if (!vendaAtual.paga) {
        mostrarToast("Finalize o pagamento antes de enviar para a nota fiscal.", "warning");
        return;
      }

      const payload = {
        tipo: "nota-fiscal",
        acao: "emitir-nota-fiscal",
        ...gerarPayloadVenda()
      };

      vendaAtual.notaFiscalEnviada = true;
      sessionStorage.setItem(STORAGE_KEYS.notaFiscalPendente, JSON.stringify(payload));

      window.location.href = "ntfe.html";
    }

    function fecharCaixa() {
      const confirmar = window.confirm("Deseja fechar o caixa?");
      if (!confirmar) return;

      mostrarToast("Caixa fechado no frontend. Backend será integrado depois.", "info");
    }

    function alternarSidebar() {
      document.body.classList.toggle("sidebar-hidden");

      const menuEscondido = document.body.classList.contains("sidebar-hidden");
      toggleSidebarBtn.textContent = menuEscondido ? "MOSTRAR" : "ESCONDER";
    }

    barcodeInput.addEventListener("input", function () {
      this.value = sanitizarEntrada(this.value);
    });

    searchProductInput.addEventListener("input", function () {
      this.value = sanitizarEntrada(this.value);
    });

    barcodeInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        adicionarProdutoPorCodigo(barcodeInput.value);
        barcodeInput.value = "";
      }
    });

    searchProductInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        pesquisarProdutoNoEstoque(searchProductInput.value);
        searchProductInput.value = "";
      }
    });

    productList.addEventListener("click", function (event) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;

      const action = target.dataset.action;
      const index = Number(target.dataset.index);

      if (!action || Number.isNaN(index)) return;

      const produto = produtosVenda[index];
      if (!produto) return;

      const isGranel = produto.tipoVenda === "granel";

      if (action === "increment") {
        if (isGranel) {
          produto.quantidade = Math.min(Number(produto.quantidade) + 0.050, 1000);
        } else {
          produto.quantidade += 1;
        }
      }

      if (action === "decrement") {
        if (isGranel) {
          produto.quantidade = Number(produto.quantidade) - 0.050;
        } else {
          produto.quantidade -= 1;
        }

        removerProdutoSeQuantidadeZero(index);
      }

      resetarPagamento();
      renderizarLista();
    });

    productList.addEventListener("input", function (event) {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) return;

      const action = target.dataset.action;
      const index = Number(target.dataset.index);

      if (action !== "manual" || Number.isNaN(index)) return;

      const produto = produtosVenda[index];
      if (!produto) return;

      const isGranel = produto.tipoVenda === "granel";
      let quantidade = Number(target.value);

      if (Number.isNaN(quantidade)) {
        quantidade = isGranel ? 0.050 : 0;
      }

      if (isGranel) {
        quantidade = Math.max(0.050, Math.min(quantidade, 1000));
        produto.quantidade = Number(quantidade.toFixed(3));
      } else {
        quantidade = Math.max(0, Math.floor(quantidade));
        produto.quantidade = quantidade;
      }

      removerProdutoSeQuantidadeZero(index);
      resetarPagamento();
      renderizarLista();
    });

    pagarBtn.addEventListener("click", abrirModalPagamento);
    closePaymentModal.addEventListener("click", fecharModalPagamento);
    cancelarPagamentoBtn.addEventListener("click", fecharModalPagamento);
    pagoBtn.addEventListener("click", concluirPagamento);

    paymentMethod.addEventListener("change", atualizarCampoMaquininha);
    paymentValue.addEventListener("input", atualizarResumoModal);

    paymentOverlay.addEventListener("click", function (event) {
      if (event.target === paymentOverlay) {
        fecharModalPagamento();
      }
    });

    descontoBtn.addEventListener("click", abrirModalDesconto);
    closeDiscountModal.addEventListener("click", fecharModalDesconto);
    cancelDiscountBtn.addEventListener("click", fecharModalDesconto);
    applyDiscountBtn.addEventListener("click", aplicarDesconto);
    removeDiscountBtn.addEventListener("click", removerDesconto);

    discountOverlay.addEventListener("click", function (event) {
      if (event.target === discountOverlay) {
        fecharModalDesconto();
      }
    });

    cancelarVendaBtn.addEventListener("click", limparCompra);
    reciboBtn.addEventListener("click", solicitarRecibo);
    notaFiscalBtn.addEventListener("click", enviarParaNotaFiscal);
    fecharCaixaBtn.addEventListener("click", fecharCaixa);
    toggleSidebarBtn.addEventListener("click", alternarSidebar);

    renderizarLista();
    atualizarResumoModal();
  
