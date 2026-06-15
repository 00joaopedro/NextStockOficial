(function exposeScanCodeHelper(global) {
  "use strict";

  const MAX_LENGTH = 512;

  function normalize(value) {
    const normalized = String(value ?? "")
      .normalize("NFC")
      .replace(/^[\u0000\t\r\n]+/, "")
      .replace(/[\u0000\t\r\n ]+$/, "");

    if (normalized.length > MAX_LENGTH) {
      throw new Error(
        `O codigo escaneavel deve ter no maximo ${MAX_LENGTH} caracteres.`,
      );
    }

    return normalized;
  }

  global.NextStockScanCode = Object.freeze({
    MAX_LENGTH,
    normalize,
  });
})(window);
