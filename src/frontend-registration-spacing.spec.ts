import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

function readPublicScript(path: string) {
  return readFileSync(join(root, 'public', path), 'utf8');
}

function sanitizerFunction(script: string) {
  const match = script.match(
    /function sanitizarEntrada\(valor\) \{[\s\S]*?\n    \}/,
  );
  return match?.[0] || '';
}

describe('registration fields preserve spaces while typing', () => {
  it('does not trim the cadastro input value on every keystroke', () => {
    const cadastro = sanitizerFunction(
      readPublicScript('Js/csp-extracted/cadastro-inline1.js'),
    );

    expect(cadastro).toContain('.replace(');
    expect(cadastro).not.toContain('.trim()');
  });

  it('asserts the behavior of the active cash-register script', () => {
    const caixa = readPublicScript('Js/caixa.js');

    expect(caixa).toContain(
      'els.searchInput.addEventListener("input", scheduleAutocomplete)',
    );
    expect(caixa).not.toContain('sanitizarEntrada');
  });

  it('keeps pet profile spaces until the final payload normalization', () => {
    const clientePet = readPublicScript('Js/clientePet.js');

    expect(clientePet).toContain('name: perfilClienteNome.value.trim()');
    expect(clientePet).toContain('name: clienteNomeCompleto.value.trim()');
    expect(clientePet).toContain('name: animalNome.value.trim()');
  });
});
