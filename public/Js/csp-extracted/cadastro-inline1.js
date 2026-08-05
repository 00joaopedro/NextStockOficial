    const precoCusto = document.getElementById("precoCusto");
    const percentualLucro = document.getElementById("percentualLucro");
    const precoVenda = document.getElementById("precoVenda");
    const produtoForm = document.getElementById("produtoForm");
    const imgInput = document.getElementById("img");
    const imageList = document.getElementById("imageList");

    const btnConsultar = document.getElementById("btnConsultar");
    const btnCadastrar = document.getElementById("btnCadastrar");
    const btnNovo = document.getElementById("btnNovo");
    const btnAtualizar = document.getElementById("btnAtualizar");
    const btnDeletar = document.getElementById("btnDeletar");

    const consultaModal = document.getElementById("consultaModal");
    const pesquisaProdutoInput = document.getElementById("pesquisaProdutoInput");
    const resultList = document.getElementById("resultList");
    const btnOkConsulta = document.getElementById("btnOkConsulta");
    const btnFecharModal = document.getElementById("btnFecharModal");

    let imagensSelecionadas = [];
    let produtoSelecionadoConsulta = null;
    let produtoEmEdicaoId = null;
    let produtosConsulta = [];
    let modoSistema = "pendente";
    let usuarioSuperAdmin = sessionStorage.getItem("nextstockIsSuperAdmin") === "true";
    let sessaoAutenticada = false;
    let selectedBranch = lerSelectedBranch();
    let systemTypeAtual = sessionStorage.getItem("nextstockSelectedSystemType") ||
      sessionStorage.getItem("nextstockSystemType") ||
      selectedBranch?.systemType ||
      "padrao";
    const mensagemModoVisualizacao = "Modo visualiza\u00e7\u00e3o: altera\u00e7\u00e3o bloqueada.";
    const mensagemSessaoInvalida = "Sess\u00e3o expirada ou inv\u00e1lida. Fa\u00e7a login novamente.";

    function detectarPreviewExplicito() {
      const params = new URLSearchParams(window.location.search);
      return sessionStorage.getItem("nextstockIsPreview") === "true" ||
        sessionStorage.getItem("nextstockPreviewMode") === "true" ||
        sessionStorage.getItem("nextstockBackendMode") === "preview" ||
        params.get("mode") === "preview";
    }

    function lerSelectedBranch() {
      try {
        return JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
      } catch {
        return null;
      }
    }

    function salvarContextoProducao(branch) {
      if (!branch) return;

      selectedBranch = branch;
      systemTypeAtual = branch.systemType || systemTypeAtual || "padrao";
      modoSistema = systemTypeAtual === "petshop" ? "petshop" : "padrao";
      sessionStorage.setItem("nextstockSelectedBranch", JSON.stringify(branch));
      sessionStorage.setItem("nextstockSystemType", systemTypeAtual);
      sessionStorage.setItem("nextstockSelectedSystemType", systemTypeAtual);
      sessionStorage.setItem("nextstockBackendMode", modoSistema === "visualizacao" ? "preview" : "production");
      sessionStorage.setItem("nextstockTenantId", branch.tenantId || "");
      sessionStorage.setItem("nextstockBranchId", branch.id || "");
    }

    function obterMensagemErro(response, data) {
      if (response.status === 401) return mensagemSessaoInvalida;
      if (response.status === 403) return data.message || "Usuario sem permissao para cadastrar produtos.";
      if (Array.isArray(data.message)) return data.message.join(" ");
      return data.message || data.error || "Nao foi possivel concluir a operacao.";
    }

    function normalizarModoApi(mode) {
      if (mode === "visualizacao") return "visualizacao";
      if (mode === "petshop") return "petshop";
      if (mode === "padrao") return "padrao";
      return modoSistema;
    }

    function obterBranchDoPerfil(user) {
      if (!user) return null;
      if (user.selectedBranch) return user.selectedBranch;
      if (user.branch?.id && user.tenantId) {
        return {
          id: user.branch.id,
          name: user.branch.name,
          tenantId: user.tenantId,
          systemType: user.systemType || user.tenant?.systemType || systemTypeAtual
        };
      }
      if (Array.isArray(user.branches) && user.branches.length > 0) {
        return user.branches[0];
      }
      return null;
    }

    async function validarSessaoReal() {
      let profile;

      try {
        profile = await apiFetch("/auth/profile");
      } catch {
        sessaoAutenticada = false;
        window.clearNextStockSessionState?.();
        throw new Error(mensagemSessaoInvalida);
      }

      const user = profile.user || profile;
      usuarioSuperAdmin = isSuperAdminUser(user) || usuarioSuperAdmin;
      sessaoAutenticada = true;
      sessionStorage.setItem("nextstockAuthenticatedUser", JSON.stringify(user));

      if (usuarioSuperAdmin) {
        sessionStorage.setItem("nextstockIsSuperAdmin", "true");
      }

      const branch = profile.selectedBranch || selectedBranch || obterBranchDoPerfil(user);
      if (!branch?.tenantId) {
        throw new Error("Usuario sem tenant/empresa vinculado.");
      }
      if (!branch?.id) {
        throw new Error("Usuario sem filial selecionada.");
      }

      salvarContextoProducao(branch);
      await carregarContextoSistema();
      return branch;
    }

    async function carregarContextoSistema() {
      const context = await apiFetch("/system/context");
      if (context.systemMode === "PREVIEW") {
        modoSistema = "visualizacao";
        window.setNextStockBackendContext?.(context);
        return context;
      }

      sessaoAutenticada = true;
      modoSistema = systemTypeAtual === "petshop" ? "petshop" : "padrao";
      if (context.tenantType === "PETSHOP") {
        systemTypeAtual = "petshop";
      } else if (context.tenantType === "STANDARD") {
        systemTypeAtual = "padrao";
      }
      sessionStorage.setItem("nextstockBackendMode", "production");
      sessionStorage.setItem("nextstockSystemType", systemTypeAtual);
      sessionStorage.setItem("nextstockSelectedSystemType", systemTypeAtual);
      return context;
    }

    async function inicializarContextoAutenticado() {
      try {
        await validarSessaoReal();
      } catch (error) {
        sessaoAutenticada = false;
        modoSistema = "pendente";
        if (!detectarPreviewExplicito()) window.clearNextStockSessionState?.();
        console.warn(error.message);
      }
    }

    function montarPayloadProduto(dados) {
      return { ...dados };
    }

    /*
      {
        nome: "Camisa Polo Azul",
        precoCusto: "45.00",
        percentualLucro: "30",
        precoVenda: "58.50",
        quantidade: "10",
        marca: "NextWear",
        categoria: "Roupas",
        fornecedor: "Fornecedor Azul",
        sku: "CAM-001",
        codigoBarra: "7891111111111",
        descricao: "Camisa polo masculina azul",
        peso: "300 g",
        altura: "5 cm",
        largura: "20 cm",
        linkExterno: "",
        tamanhoRoupa: "M",
        tamanhoVestimenta: "40",
        imagens: ["camisa-polo-azul.jpg", "camisa-polo-detalhe.jpg"]
      },
      {
        nome: "Tênis Esportivo Preto",
        precoCusto: "120.00",
        percentualLucro: "25",
        precoVenda: "150.00",
        quantidade: "6",
        marca: "MoveFit",
        categoria: "Calçados",
        fornecedor: "Fornecedor Running",
        sku: "TEN-010",
        codigoBarra: "7892222222222",
        descricao: "Tênis esportivo leve",
        peso: "800 g",
        altura: "14 cm",
        largura: "28 cm",
        linkExterno: "",
        tamanhoRoupa: "GG",
        tamanhoVestimenta: "42",
        imagens: ["tenis-preto.jpg"]
      }
    */

    function sanitizarEntrada(valor) {
      return String(valor)
        .trim()
        .replace(/[\0\x08\x09\x1a\n\r"'\\;%]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 150);
    }

    function normalizarCodigoEscaneavel(valor) {
      return window.NextStockScanCode.normalize(valor);
    }

    function calcularPrecoVenda() {
      const custo = parseFloat(precoCusto.value) || 0;
      const lucro = parseFloat(percentualLucro.value) || 0;
      const valorFinal = custo + (custo * (lucro / 100));
      precoVenda.value = valorFinal.toFixed(2);
    }

    function aplicarSanitizacaoNosInputs() {
      const camposTexto = produtoForm.querySelectorAll('input[type="text"]');

      camposTexto.forEach((campo) => {
        if (campo.id === "codigoBarra") return;
        campo.addEventListener("input", function () {
          this.value = sanitizarEntrada(this.value);
        });
      });
    }

    function renderizarListaImagens() {
      imageList.replaceChildren();

      if (imagensSelecionadas.length === 0) return;

      imagensSelecionadas.forEach((imagem, index) => {
        const item = document.createElement("div");
        item.className = "image-item";

        const name = document.createElement("span");
        name.className = "image-name";
        name.textContent = imagem.nome;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-image-btn";
        remove.dataset.index = String(index);
        remove.textContent = "X";

        item.append(name, remove);

        imageList.appendChild(item);
      });
    }

    function definirMensagemResultado(mensagem) {
      const item = document.createElement("div");
      item.className = "empty-result";
      item.textContent = mensagem;
      resultList.replaceChildren(item);
    }

    function parseNumero(valor) {
      const numero = Number(String(valor).replace(",", "."));
      return Number.isFinite(numero) ? numero : 0;
    }

    function obterDadosFormulario() {
      return {
        nome: document.getElementById("nome").value.trim(),
        precoCusto: parseNumero(document.getElementById("precoCusto").value),
        percentualLucro: parseNumero(document.getElementById("percentualLucro").value),
        precoVenda: parseNumero(document.getElementById("precoVenda").value),
        quantidade: Number(document.getElementById("quantidade").value),
        marca: document.getElementById("marca").value.trim(),
        categoria: document.getElementById("categoria").value.trim(),
        fornecedor: document.getElementById("fornecedor").value.trim(),
        sku: document.getElementById("sku").value.trim(),
        codigoBarra: normalizarCodigoEscaneavel(
          document.getElementById("codigoBarra").value
        ),
        descricao: document.getElementById("descricao").value.trim(),
        peso: document.getElementById("peso").value.trim(),
        altura: document.getElementById("altura").value.trim(),
        largura: document.getElementById("largura").value.trim(),
        linkExterno: document.getElementById("linkExterno").value.trim(),
        tamanhoRoupa: document.getElementById("tamanhoRoupa").value,
        tamanhoVestimenta: document.getElementById("tamanhoVestimenta").value.trim()
      };
    }

    function preencherFormulario(produto) {
      document.getElementById("nome").value = produto.nome || "";
      document.getElementById("precoCusto").value = produto.precoCusto || "";
      document.getElementById("percentualLucro").value = produto.percentualLucro || "";
      document.getElementById("precoVenda").value = produto.precoVenda || "";
      document.getElementById("quantidade").value = produto.quantidade || "";
      document.getElementById("marca").value = produto.marca || "";
      document.getElementById("categoria").value = produto.categoria || "";
      document.getElementById("fornecedor").value = produto.fornecedor || "";
      document.getElementById("sku").value = produto.sku || "";
      document.getElementById("codigoBarra").value = produto.codigoBarra || "";
      document.getElementById("descricao").value = produto.descricao || "";
      document.getElementById("peso").value = produto.peso || "";
      document.getElementById("altura").value = produto.altura || "";
      document.getElementById("largura").value = produto.largura || "";
      document.getElementById("linkExterno").value = produto.linkExterno || "";
      document.getElementById("tamanhoRoupa").value = produto.tamanhoRoupa || "";
      document.getElementById("tamanhoVestimenta").value = produto.tamanhoVestimenta || "";

      imagensSelecionadas = (produto.imageMetadata || []).map((imagem) => ({
        id: imagem.id,
        nome: imagem.fileName || imagem.nome
      }));

      if (imagensSelecionadas.length === 0) {
        imagensSelecionadas = (produto.imagens || []).map((nome) => ({ nome }));
      }

      renderizarListaImagens();

      produtoEmEdicaoId = produto.id;
    }

    function limparFormularioCompleto() {
      produtoForm.reset();
      imagensSelecionadas = [];
      renderizarListaImagens();
      produtoEmEdicaoId = null;
      produtoSelecionadoConsulta = null;
      imgInput.value = "";
      pesquisaProdutoInput.value = "";
      resultList.replaceChildren();
    }

    async function abrirModalConsulta() {
      consultaModal.classList.add("active");
      pesquisaProdutoInput.value = "";
      produtoSelecionadoConsulta = null;
      definirMensagemResultado("Carregando produtos...");
      try {
        await buscarProdutos();
      } catch (error) {
        definirMensagemResultado(error.message);
        return;
      }
      renderizarResultadosConsulta();
      pesquisaProdutoInput.focus();
    }

    function fecharModalConsulta() {
      consultaModal.classList.remove("active");
    }

    async function apiFetch(url, options = {}) {
      const branch = lerSelectedBranch() || selectedBranch;
      const isMultipart = options.body instanceof FormData;
      const headers = {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        ...(branch?.id ? { "x-nextstock-branch-id": branch.id } : {}),
        ...(options.headers || {})
      };
      const response = await fetch(`/api${url}`, {
        credentials: "include",
        headers,
        ...options
      });

      const data = await response.json().catch(() => ({}));
      usuarioSuperAdmin = isSuperAdminUser(data.user || data) || usuarioSuperAdmin;

      if (!response.ok) {
        throw new Error(obterMensagemErro(response, data));
      }

      return data;
    }

    function isSuperAdminUser(user) {
      return user?.role === "superAdmin" ||
        user?.roles?.includes?.("superAdmin") === true ||
        user?.isSuperAdmin === true ||
        user?.is_super_admin === true;
    }

    async function buscarProdutos(termo = "") {
      const params = new URLSearchParams();
      const pesquisa = sanitizarEntrada(termo);

      if (pesquisa) params.set("search", pesquisa);

      const data = await apiFetch(`/products${params.toString() ? `?${params}` : ""}`);
      const modoApi = normalizarModoApi(data.mode);
      if (modoApi !== "visualizacao" || !sessaoAutenticada || detectarPreviewExplicito()) {
        modoSistema = modoApi;
      }
      if (data.isSuperAdmin) usuarioSuperAdmin = true;
      produtosConsulta = data.products || [];
      return produtosConsulta;
    }

    function alteracaoBloqueadaEmVisualizacao() {
      if (!detectarPreviewExplicito() && modoSistema !== "visualizacao") return false;
      alert(mensagemModoVisualizacao);
      return true;
    }

    function validarObrigatorios(dados) {
      return (
        dados.nome &&
        dados.precoCusto >= 0 &&
        dados.percentualLucro >= 0 &&
        dados.precoVenda >= 0 &&
        Number.isInteger(dados.quantidade) &&
        dados.quantidade >= 0
      );
    }

    async function enviarImagensProduto(productId, somenteNovas = false) {
      const imagensParaUpload = imagensSelecionadas
        .filter((imagem) => imagem.arquivo && (!somenteNovas || !imagem.id))
        .slice(0, 3);

      if (imagensParaUpload.length === 0) return { total: 0, falhas: [] };

      const falhas = [];

      for (const imagem of imagensParaUpload) {
        const formData = new FormData();
        formData.append("file", imagem.arquivo);

        try {
          await apiFetch(`/products/${productId}/images/upload`, {
            method: "POST",
            body: formData
          });
        } catch (error) {
          falhas.push({
            nome: imagem.nome,
            mensagem: error.message || "Falha no upload."
          });
        }
      }

      return { total: imagensParaUpload.length, falhas };
    }

    function obterProdutosFiltrados() {
      const termo = sanitizarEntrada(pesquisaProdutoInput.value).toLowerCase();

      if (!termo) {
        return produtosConsulta.map((produto, index) => ({ produto, index }));
      }

      return produtosConsulta
        .map((produto, index) => ({ produto, index }))
        .filter(({ produto }) => produto.nome.toLowerCase().includes(termo));
    }

    function renderizarResultadosConsulta() {
      const resultados = obterProdutosFiltrados();

      if (resultados.length === 0) {
        definirMensagemResultado("Nenhum produto encontrado.");
        return;
      }

      const fragment = document.createDocumentFragment();

      resultados.forEach(({ produto, index }) => {
        const item = document.createElement("div");
        item.className = "result-item";

        if (produtoSelecionadoConsulta === index) {
          item.classList.add("active");
        }

        const name = document.createElement("div");
        name.className = "result-name";
        name.textContent = produto.nome;

        const details = document.createElement("div");
        details.className = "result-sub";
        details.textContent = `SKU: ${produto.sku || "-"} | Código: ${
          produto.codigoBarra || "-"
        } | Estoque: ${produto.quantidade || "0"}`;

        item.addEventListener("click", () => {
          produtoSelecionadoConsulta = index;
          renderizarResultadosConsulta();
        });

        item.append(name, details);
        fragment.appendChild(item);
      });

      resultList.replaceChildren(fragment);
    }

    function confirmarConsultaProduto() {
      if (produtoSelecionadoConsulta === null) {
        alert("Selecione um produto da lista.");
        return;
      }

      const produto = produtosConsulta[produtoSelecionadoConsulta];
      preencherFormulario(produto);
      fecharModalConsulta();
    }

    async function cadastrarProduto() {
      let dados;
      try {
        dados = obterDadosFormulario();
      } catch (error) {
        alert(error.message);
        return;
      }

      if (!validarObrigatorios(dados)) {
        alert("Preencha os campos obrigatórios.");
        return;
      }

      try {
        await validarSessaoReal();
        if (alteracaoBloqueadaEmVisualizacao()) return;

        const data = await apiFetch("/products", {
          method: "POST",
          body: JSON.stringify(montarPayloadProduto(dados))
        });

        if (imagensSelecionadas.length > 0) {
          const resultadoUpload = await enviarImagensProduto(data.product.id);

          if (resultadoUpload.falhas.length > 0) {
            alert(`Produto cadastrado, mas ${resultadoUpload.falhas.length} imagem(ns) falharam no upload.`);
          }
        }

        alert("Produto cadastrado com sucesso.");
        limparFormularioCompleto();
      } catch (error) {
        alert(error.message);
      }
    }

    async function atualizarProduto() {
      if (!produtoEmEdicaoId) {
        alert("Consulte e selecione um produto para atualizar.");
        return;
      }

      let dados;
      try {
        dados = obterDadosFormulario();
      } catch (error) {
        alert(error.message);
        return;
      }

      if (!validarObrigatorios(dados)) {
        alert("Preencha os campos obrigatórios.");
        return;
      }

      try {
        await validarSessaoReal();
        if (alteracaoBloqueadaEmVisualizacao()) return;

        await apiFetch(`/products/${produtoEmEdicaoId}`, {
          method: "PATCH",
          body: JSON.stringify(montarPayloadProduto(dados))
        });

        const resultadoUpload = await enviarImagensProduto(produtoEmEdicaoId, true);

        if (resultadoUpload.falhas.length > 0) {
          alert(`Produto atualizado, mas ${resultadoUpload.falhas.length} imagem(ns) falharam no upload.`);
        }

        alert("Produto atualizado com sucesso.");
      } catch (error) {
        alert(error.message);
      }
    }

    async function deletarProduto() {
      if (!produtoEmEdicaoId) {
        alert("Consulte e selecione um produto para deletar.");
        return;
      }

      const confirmar = confirm("Deseja realmente excluir este produto?");
      if (!confirmar) return;

      try {
        await validarSessaoReal();
        if (alteracaoBloqueadaEmVisualizacao()) return;

        await apiFetch(`/products/${produtoEmEdicaoId}`, {
          method: "DELETE"
        });
        alert("Produto excluido com sucesso.");
        limparFormularioCompleto();
      } catch (error) {
        alert(error.message);
      }
    }

    function novoProduto() {
      limparFormularioCompleto();
      document.getElementById("nome").focus();
    }

    precoCusto.addEventListener("input", calcularPrecoVenda);
    percentualLucro.addEventListener("input", calcularPrecoVenda);

    const codigoBarraInput = document.getElementById("codigoBarra");
    codigoBarraInput.addEventListener("keydown", (event) => {
      if (!["Enter", "Tab"].includes(event.key)) return;
      event.preventDefault();
      try {
        codigoBarraInput.value = normalizarCodigoEscaneavel(
          codigoBarraInput.value
        );
        document.getElementById("descricao").focus();
      } catch (error) {
        alert(error.message);
      }
    });
    codigoBarraInput.addEventListener("blur", () => {
      try {
        codigoBarraInput.value = normalizarCodigoEscaneavel(
          codigoBarraInput.value
        );
      } catch (error) {
        alert(error.message);
      }
    });

    imgInput.addEventListener("change", function (event) {
      const arquivos = Array.from(event.target.files);
      const totalAntes = imagensSelecionadas.length;

      arquivos.forEach((arquivo) => {
        if (imagensSelecionadas.length >= 3) return;
        imagensSelecionadas.push({ nome: arquivo.name, arquivo });
      });

      if (totalAntes + arquivos.length > 3) {
        alert("Limite maximo de 3 imagens por produto.");
      }

      renderizarListaImagens();
      imgInput.value = "";
    });

    imageList.addEventListener("click", async function (event) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("remove-image-btn")) return;

      const index = Number(target.dataset.index);
      if (Number.isNaN(index)) return;

      const imagem = imagensSelecionadas[index];

      if (imagem?.id && produtoEmEdicaoId) {
        await validarSessaoReal()
          .then(() => {
            if (alteracaoBloqueadaEmVisualizacao()) return undefined;
            return apiFetch(`/products/${produtoEmEdicaoId}/images/${imagem.id}`, {
              method: "DELETE"
            });
          })
          .catch((error) => alert(error.message));
      }

      imagensSelecionadas.splice(index, 1);
      renderizarListaImagens();
    });

    btnConsultar.addEventListener("click", abrirModalConsulta);
    btnFecharModal.addEventListener("click", fecharModalConsulta);
    btnOkConsulta.addEventListener("click", confirmarConsultaProduto);
    pesquisaProdutoInput.addEventListener("input", async () => {
      try {
        await buscarProdutos(pesquisaProdutoInput.value);
      } catch (error) {
        definirMensagemResultado(error.message);
        return;
      }
      renderizarResultadosConsulta();
    });

    btnCadastrar.addEventListener("click", cadastrarProduto);
    btnNovo.addEventListener("click", novoProduto);
    btnAtualizar.addEventListener("click", atualizarProduto);
    btnDeletar.addEventListener("click", deletarProduto);

    consultaModal.addEventListener("click", function (event) {
      if (event.target === consultaModal) {
        fecharModalConsulta();
      }
    });

    if (window.isNextStockDemoMode?.()) {
      modoSistema = "visualizacao";
      definirMensagemResultado("Modo visualizacao: consultas demonstrativas e alteracoes bloqueadas.");
    } else {
      inicializarContextoAutenticado()
        .then(() => buscarProdutos())
        .catch((error) => console.warn(error.message));
    }
    aplicarSanitizacaoNosInputs();
  
