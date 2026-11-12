import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const read = (path: string) =>
  readFileSync(join(process.cwd(), 'public', path), 'utf8');
const html = read('guia.html');
const script = read('Js/guide-search.js');

function makeGuide() {
  const sections = Array.from(
    html.matchAll(/<section class="guide-section"[^>]*>([\s\S]*?)<\/section>/g),
    ([, content]) => {
      const heading = {
        textContent: content.match(/<h2[^>]*>(.*?)<\/h2>/)![1],
      };
      const articles = Array.from(
        content.matchAll(
          /<details class="guide-article" data-keywords="([^"]+)">([\s\S]*?)<\/details>/g,
        ),
        ([, keywords, text]) => ({
          dataset: { keywords },
          textContent: text.replace(/<[^>]*>/g, ' '),
          hidden: false,
        }),
      );
      return {
        heading,
        articles,
        hidden: false,
        querySelector: () => heading,
        querySelectorAll: () => articles,
      };
    },
  );
  function control() {
    const listeners = new Map<string, () => void>();
    return {
      hidden: true,
      value: '',
      textContent: '',
      disabled: false,
      focus: jest.fn(),
      addEventListener: (name: string, handler: () => void) =>
        listeners.set(name, handler),
      dispatch: (name: string) => listeners.get(name)?.(),
    };
  }
  const form = control(),
    input = control(),
    clear = control(),
    empty = control(),
    results = control(),
    topics = control();
  const controls: Record<string, ReturnType<typeof control>> = {
    'guide-search': form,
    'guide-query': input,
    'guide-clear': clear,
    'guide-results': results,
    'guide-empty': empty,
    'guide-topics': topics,
  };
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => controls[id],
      querySelectorAll: () => sections,
    },
  });
  const search = (query: string) => {
    input.value = query;
    input.dispatch('input');
    return sections.flatMap((section) =>
      section.articles
        .filter((article) => !article.hidden)
        .map((article) => article.textContent),
    );
  };
  return { form, input, clear, empty, results, sections, topics, search };
}

describe('Guia do NextStock', () => {
  it.each([
    ['Como faço para cadastrar um produto?', 'Cadastrar um produto'],
    ['FECHAMENTO DE CAIXA', 'Entender a tela de Fechamento'],
    ['vacinas animal', 'Cadastrar ou editar um animal'],
    ['nota fiscal SEFAZ', 'Preparar e emitir uma NF-e'],
    ['migracao CSV', 'Consultar a tela de migração'],
  ])('encontra instruções para %s', (query, title) => {
    expect(
      makeGuide()
        .search(query)
        .some((text) => text.includes(title)),
    ).toBe(true);
  });

  it('explica ausência de resultados e volta aos assuntos ao limpar', () => {
    const guide = makeGuide();
    expect(guide.form.hidden).toBe(false);
    expect(guide.search('<script>não-existe-xyz</script>')).toHaveLength(0);
    expect(guide.sections.every((section) => section.hidden)).toBe(true);
    expect(guide.empty.hidden).toBe(false);
    expect(guide.results.textContent).toBe('0 orientações encontradas.');
    guide.clear.dispatch('click');
    expect(guide.sections.every((section) => !section.hidden)).toBe(true);
    expect(guide.topics.hidden).toBe(false);
    expect(guide.empty.hidden).toBe(true);
    expect(guide.input.focus).toHaveBeenCalled();
  });
});
