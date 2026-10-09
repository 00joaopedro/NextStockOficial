# Etiquetas de balança

O lookup do PDV aceita etiquetas configuráveis em CompanyFiscalConfig.providerConfig.scaleBarcode.

Exemplo para etiqueta EAN-13 de balança:

    {
      "scaleBarcode": {
        "enabled": true,
        "formats": [
          {
            "name": "ean13-weight",
            "prefix": "2",
            "length": 13,
            "productStart": 1,
            "productLength": 6,
            "payloadStart": 7,
            "payloadLength": 5,
            "payloadType": "weight",
            "decimals": 3,
            "checkDigit": "mod10"
          }
        ]
      }
    }

Os índices são baseados em zero. A etiqueta padrão usa o primeiro dígito como prefixo, seis dígitos para o código do produto, cinco dígitos para o peso e o último dígito como verificador Mod-10.

Para etiquetas que carregam valor total, use payloadType: "value". O sistema converte o valor em centavos e calcula automaticamente a quantidade usando o preço unitário do produto pesável.

O produto identificado precisa ser pesável, estar na filial selecionada e possuir estoque suficiente. Etiquetas com formato reconhecido, mas dígito verificador inválido, peso/valor zerado ou produto incompatível são rejeitadas com mensagem clara. Códigos comuns continuam usando a busca normal por barcode/SKU.
