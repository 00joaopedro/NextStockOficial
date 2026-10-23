import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

function publicFile(path: string) {
  return readFileSync(join(root, 'public', path), 'utf8');
}

describe('operational frontend resilience', () => {
  it('provides a reusable URL, retry and unsaved-changes guard', () => {
    const helper = publicFile('Js/page-resilience.js');

    expect(helper).toContain('readUrlState');
    expect(helper).toContain('writeUrlState');
    expect(helper).toContain('renderRetry');
    expect(helper).toContain('createDirtyGuard');
    expect(helper).toContain('beforeunload');
  });

  it('loads the helper before operational page scripts', () => {
    for (const page of ['agendaPet.html', 'historico.html', 'pedido.html', 'funcionario.html']) {
      expect(publicFile(page)).toContain('./Js/page-resilience.js');
    }
  });

  it('persists list state and exposes safe retry actions', () => {
    const agenda = publicFile('Js/agendaPet.ts');
    const history = publicFile('Js/historico.js');
    const orders = publicFile('Js/pedido.js');
    const employees = publicFile('Js/funcionario.js');

    expect(agenda).toContain('syncUrlState');
    expect(agenda).toContain('agendaDirtyGuard');
    expect(agenda).toContain('renderRetry');
    expect(agenda).toContain('populatePetSelects();\n  petFilter.value = selectedPetId;');
    expect(agenda).toContain('loadAppointments().catch(renderError)');
    expect(history).toContain('syncUrlState');
    expect(history).toContain('renderRetry');
    expect(orders).toContain('syncUrlState');
    expect(orders).toContain('retryOrders');
    expect(employees).toContain('employeeDirtyGuard');
    expect(employees).toContain('renderRetry');
    expect(employees).toContain('let loadError = null;');
    expect(employees).toContain('employeeDirtyGuard?.markClean();');
  });
});
