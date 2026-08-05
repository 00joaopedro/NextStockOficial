    if (window.isNextStockDemoMode?.()) {
    const supplierForm = document.getElementById("supplierForm");
    const supplierList = document.getElementById("supplierList");
    const emptyMessage = document.getElementById("emptyMessage");
    const searchSupplierInput = document.getElementById("searchSupplierInput");

    const btnNovo = document.getElementById("btnNovo");
    const btnApagar = document.getElementById("btnApagar");
    const btnSalvar = document.getElementById("btnSalvar");

    const fields = {
      razaoSocial: document.getElementById("razaoSocial"),
      nomeFantasia: document.getElementById("nomeFantasia"),
      tipoPessoa: document.getElementById("tipoPessoa"),
      cnpjCpf: document.getElementById("cnpjCpf"),
      inscricaoEstadual: document.getElementById("inscricaoEstadual"),
      contatoPrincipal: document.getElementById("contatoPrincipal"),
      telefone: document.getElementById("telefone"),
      whatsapp: document.getElementById("whatsapp"),
      email: document.getElementById("email"),
      site: document.getElementById("site"),
      cep: document.getElementById("cep"),
      cidade: document.getElementById("cidade"),
      estado: document.getElementById("estado"),
      bairro: document.getElementById("bairro"),
      rua: document.getElementById("rua"),
      numero: document.getElementById("numero"),
      complemento: document.getElementById("complemento"),
      prazoEntrega: document.getElementById("prazoEntrega"),
      categoriaProdutos: document.getElementById("categoriaProdutos"),
      formaPagamento: document.getElementById("formaPagamento"),
      statusFornecedor: document.getElementById("statusFornecedor"),
      observacoes: document.getElementById("observacoes")
    };

    let fornecedorSelecionadoId = null;

    const DEMO_FORNECEDORES = [
      {
        id: 1,
        razaoSocial: "Distribuidora Pet Norte LTDA",
        nomeFantasia: "Pet Norte",
        tipoPessoa: "Pessoa Jurídica",
        cnpjCpf: "12.345.678/0001-90",
        inscricaoEstadual: "123456789",
        contatoPrincipal: "Mariana Souza",
        telefone: "(91) 3333-1111",
        whatsapp: "(91) 99999-1111",
        email: "contato@petnorte.com.br",
        site: "www.petnorte.com.br",
        cep: "66000-000",
        cidade: "Belém",
        estado: "PA",
        bairro: "Marco",
        rua: "Av. José Bonifácio",
        numero: "1200",
        complemento: "Galpão A",
        prazoEntrega: "2 dias úteis",
        categoriaProdutos: "Rações e medicamentos",
        formaPagamento: "PIX, boleto",
        statusFornecedor: "Ativo",
        observacoes: "Fornecedor com entregas frequentes e bom prazo."
      },
      {
        id: 2,
        razaoSocial: "Carlos Henrique Almeida",
        nomeFantasia: "Carlos Acessórios Pet",
        tipoPessoa: "Pessoa Física",
        cnpjCpf: "123.456.789-10",
        inscricaoEstadual: "",
        contatoPrincipal: "Carlos Henrique",
        telefone: "(91) 3222-2222",
        whatsapp: "(91) 98888-2222",
        email: "carlos@acessoriospet.com",
        site: "",
        cep: "67000-000",
        cidade: "Ananindeua",
        estado: "PA",
        bairro: "Centro",
        rua: "Rua das Acácias",
        numero: "88",
        complemento: "",
        prazoEntrega: "5 dias úteis",
        categoriaProdutos: "Acessórios",
        formaPagamento: "Dinheiro, transferência",
        statusFornecedor: "Ativo",
        observacoes: "Atende sob encomenda para alguns produtos."
      }
    ];
    let fornecedores = window.isNextStockDemoMode?.() ? DEMO_FORNECEDORES : [];

    function sanitizarTexto(valor) {
      return String(valor)
        .replace(/\s+/g, " ")
        .trim();
    }

    function obterDadosFormulario() {
      return {
        razaoSocial: sanitizarTexto(fields.razaoSocial.value),
        nomeFantasia: sanitizarTexto(fields.nomeFantasia.value),
        tipoPessoa: fields.tipoPessoa.value,
        cnpjCpf: sanitizarTexto(fields.cnpjCpf.value),
        inscricaoEstadual: sanitizarTexto(fields.inscricaoEstadual.value),
        contatoPrincipal: sanitizarTexto(fields.contatoPrincipal.value),
        telefone: sanitizarTexto(fields.telefone.value),
        whatsapp: sanitizarTexto(fields.whatsapp.value),
        email: sanitizarTexto(fields.email.value),
        site: sanitizarTexto(fields.site.value),
        cep: sanitizarTexto(fields.cep.value),
        cidade: sanitizarTexto(fields.cidade.value),
        estado: sanitizarTexto(fields.estado.value),
        bairro: sanitizarTexto(fields.bairro.value),
        rua: sanitizarTexto(fields.rua.value),
        numero: sanitizarTexto(fields.numero.value),
        complemento: sanitizarTexto(fields.complemento.value),
        prazoEntrega: sanitizarTexto(fields.prazoEntrega.value),
        categoriaProdutos: sanitizarTexto(fields.categoriaProdutos.value),
        formaPagamento: sanitizarTexto(fields.formaPagamento.value),
        statusFornecedor: fields.statusFornecedor.value,
        observacoes: sanitizarTexto(fields.observacoes.value)
      };
    }

    function validarFornecedor(dados) {
      if (!dados.razaoSocial) {
        alert("Preencha a Razão Social / Nome do Fornecedor.");
        fields.razaoSocial.focus();
        return false;
      }

      if (!dados.tipoPessoa) {
        alert("Selecione o tipo do fornecedor.");
        fields.tipoPessoa.focus();
        return false;
      }

      if (!dados.cnpjCpf) {
        alert("Preencha o CNPJ ou CPF.");
        fields.cnpjCpf.focus();
        return false;
      }

      if (!dados.telefone) {
        alert("Preencha o telefone do fornecedor.");
        fields.telefone.focus();
        return false;
      }

      return true;
    }

    function preencherFormulario(fornecedor) {
      fields.razaoSocial.value = fornecedor.razaoSocial || "";
      fields.nomeFantasia.value = fornecedor.nomeFantasia || "";
      fields.tipoPessoa.value = fornecedor.tipoPessoa || "";
      fields.cnpjCpf.value = fornecedor.cnpjCpf || "";
      fields.inscricaoEstadual.value = fornecedor.inscricaoEstadual || "";
      fields.contatoPrincipal.value = fornecedor.contatoPrincipal || "";
      fields.telefone.value = fornecedor.telefone || "";
      fields.whatsapp.value = fornecedor.whatsapp || "";
      fields.email.value = fornecedor.email || "";
      fields.site.value = fornecedor.site || "";
      fields.cep.value = fornecedor.cep || "";
      fields.cidade.value = fornecedor.cidade || "";
      fields.estado.value = fornecedor.estado || "";
      fields.bairro.value = fornecedor.bairro || "";
      fields.rua.value = fornecedor.rua || "";
      fields.numero.value = fornecedor.numero || "";
      fields.complemento.value = fornecedor.complemento || "";
      fields.prazoEntrega.value = fornecedor.prazoEntrega || "";
      fields.categoriaProdutos.value = fornecedor.categoriaProdutos || "";
      fields.formaPagamento.value = fornecedor.formaPagamento || "";
      fields.statusFornecedor.value = fornecedor.statusFornecedor || "Ativo";
      fields.observacoes.value = fornecedor.observacoes || "";
    }

    function limparFormulario() {
      supplierForm.reset();
      fields.statusFornecedor.value = "Ativo";
      fornecedorSelecionadoId = null;
      renderizarListaFornecedores();
      fields.razaoSocial.focus();
    }

    function salvarFornecedor() {
      const dados = obterDadosFormulario();

      if (!validarFornecedor(dados)) return;

      if (fornecedorSelecionadoId === null) {
        const novoFornecedor = {
          id: Date.now(),
          ...dados
        };

        fornecedores.unshift(novoFornecedor);
        fornecedorSelecionadoId = novoFornecedor.id;
        alert("Fornecedor cadastrado com sucesso.");
      } else {
        const index = fornecedores.findIndex(item => item.id === fornecedorSelecionadoId);

        if (index === -1) {
          alert("Fornecedor não encontrado para atualização.");
          return;
        }

        fornecedores[index] = {
          ...fornecedores[index],
          ...dados
        };

        alert("Alterações salvas com sucesso.");
      }

      renderizarListaFornecedores();
    }

    function apagarFornecedor() {
      if (fornecedorSelecionadoId === null) {
        alert("Selecione um fornecedor para apagar.");
        return;
      }

      const fornecedor = fornecedores.find(item => item.id === fornecedorSelecionadoId);
      if (!fornecedor) return;

      const confirmar = confirm(`Deseja realmente apagar o fornecedor "${fornecedor.razaoSocial}"?`);
      if (!confirmar) return;

      fornecedores = fornecedores.filter(item => item.id !== fornecedorSelecionadoId);
      limparFormulario();
      alert("Fornecedor apagado com sucesso.");
    }

    function selecionarFornecedor(id) {
      const fornecedor = fornecedores.find(item => item.id === id);
      if (!fornecedor) return;

      fornecedorSelecionadoId = id;
      preencherFormulario(fornecedor);
      renderizarListaFornecedores();
    }

    function obterFornecedoresFiltrados() {
      const termo = sanitizarTexto(searchSupplierInput.value).toLowerCase();

      if (!termo) return fornecedores;

      return fornecedores.filter((fornecedor) => {
        return (
          fornecedor.razaoSocial.toLowerCase().includes(termo) ||
          fornecedor.nomeFantasia.toLowerCase().includes(termo) ||
          fornecedor.cnpjCpf.toLowerCase().includes(termo) ||
          fornecedor.contatoPrincipal.toLowerCase().includes(termo)
        );
      });
    }

    function renderizarListaFornecedores() {
      const filtrados = obterFornecedoresFiltrados();
      supplierList.innerHTML = "";

      emptyMessage.style.display = filtrados.length ? "none" : "block";

      filtrados.forEach((fornecedor) => {
        const li = document.createElement("li");
        if (fornecedor.id === fornecedorSelecionadoId) {
          li.classList.add("active");
        }

        li.innerHTML = `
          <div class="supplier-item-name">${fornecedor.razaoSocial}</div>
          <div class="supplier-item-sub">
            ${fornecedor.cnpjCpf || "Sem documento"}<br>
            ${fornecedor.contatoPrincipal || "Sem contato"} • ${fornecedor.telefone || "Sem telefone"}
          </div>
        `;

        li.addEventListener("click", () => selecionarFornecedor(fornecedor.id));
        supplierList.appendChild(li);
      });
    }

    btnNovo.addEventListener("click", limparFormulario);
    btnApagar.addEventListener("click", apagarFornecedor);
    btnSalvar.addEventListener("click", salvarFornecedor);
    searchSupplierInput.addEventListener("input", renderizarListaFornecedores);

    fields.tipoPessoa.addEventListener("change", () => {
      if (fields.tipoPessoa.value === "Pessoa Física") {
        fields.inscricaoEstadual.value = "";
      }
    });

    renderizarListaFornecedores();
    if (fornecedores.length) {
      selecionarFornecedor(fornecedores[0].id);
    } else {
      limparFormulario();
    }
    }
  
