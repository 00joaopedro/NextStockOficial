(() => {
  const form = document.getElementById('guide-search');
  const input = document.getElementById('guide-query');
  const clear = document.getElementById('guide-clear');
  const results = document.getElementById('guide-results');
  const empty = document.getElementById('guide-empty');
  const topics = document.getElementById('guide-topics');

  const normalize = (value) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\bn[ft]f?-?e\b/g, 'nfe')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const stopWords = new Set([
    'a',
    'ao',
    'as',
    'com',
    'como',
    'da',
    'das',
    'de',
    'do',
    'dos',
    'e',
    'em',
    'eu',
    'faco',
    'meu',
    'minha',
    'na',
    'nas',
    'no',
    'nos',
    'o',
    'os',
    'para',
    'por',
    'posso',
    'que',
    'quero',
    'um',
    'uma',
  ]);
  const sections = Array.from(
    document.querySelectorAll('.guide-section'),
    (section) => {
      const title = section.querySelector('h2').textContent;
      const articles = Array.from(
        section.querySelectorAll('.guide-article'),
        (article) => ({
          article,
          searchable: normalize(
            `${title} ${article.dataset.keywords} ${article.textContent}`,
          ),
        }),
      );
      return { section, articles };
    },
  );

  function filter() {
    const words = normalize(input.value).split(' ').filter(Boolean);
    const useful = words.filter((word) => !stopWords.has(word));
    const tokens = useful.length ? useful : words;
    let count = 0;

    sections.forEach(({ section, articles }) => {
      let visible = 0;
      articles.forEach(({ article, searchable }) => {
        const matches = tokens.every((word) => searchable.includes(word));
        article.hidden = !matches;
        if (matches) visible++;
      });
      section.hidden = visible === 0;
      count += visible;
    });

    topics.hidden = tokens.length > 0;
    clear.disabled = !input.value;
    empty.hidden = count > 0;
    results.textContent =
      tokens.length === 0
        ? ''
        : count === 1
          ? '1 orientação encontrada.'
          : `${count} orientações encontradas.`;
  }

  input.addEventListener('input', filter);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    filter();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    filter();
    input.focus();
  });
  form.hidden = false;
  filter();
})();
