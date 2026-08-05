    function getLocalStorageScope() {
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
        branch?.tenantId || "no-tenant",
        branch?.id || "no-branch",
        user?.id || "anonymous"
      ].join(":");
    }

    (function carregarMarcaLoja() {
      const storeBrand = document.getElementById("store-brand");
      if (!storeBrand) return;
      const storageScope = getLocalStorageScope();
      const possiveisChaves = ["marcaLoja", "marca_dono_loja", "nomeMarca", "storeBrand"];
      for (const chave of possiveisChaves) {
        const valor = localStorage.getItem(`${chave}:${storageScope}`);
        if (valor && String(valor).trim()) {
          storeBrand.value = String(valor).trim();
          return;
        }
      }
    })();
  
