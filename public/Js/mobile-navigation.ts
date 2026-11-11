/** Shared portrait navigation; existing landscape layouts remain unchanged. */
export function installMobileNavigation(): void {
  const container = document.getElementById('sidebar-container');
  if (!container || document.getElementById('nextstock-mobile-header')) return;
  const query = window.matchMedia('(max-width: 768px) and (orientation: portrait)');
  const style = document.createElement('style');
  style.textContent = `
    #nextstock-mobile-header, #nextstock-mobile-backdrop { display: none; }
    @media (max-width: 768px) and (orientation: portrait) {
      html { scroll-padding-top: 76px; }
      body.nextstock-mobile-nav { display: block !important; padding-top: calc(64px + env(safe-area-inset-top)) !important; min-width: 0 !important; }
      .nextstock-mobile-nav > .app { display: block !important; min-width: 0; }
      .nextstock-mobile-nav #sidebar-container { position: fixed !important; inset: 0 auto 0 0 !important; width: min(84vw, 320px) !important; height: 100dvh !important; z-index: 10002; transform: translateX(-105%); visibility: hidden; background: #071b31; }
      .nextstock-mobile-nav.nav-drawer-open #sidebar-container { transform: none; visibility: visible; }
      .nextstock-mobile-nav #sidebar-container .sidebar { position: static !important; display: block !important; box-sizing: border-box; width: 100% !important; min-width: 0 !important; max-width: none !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: calc(16px + env(safe-area-inset-top)) 12px 24px !important; overflow-y: auto !important; overscroll-behavior: contain; transform: none !important; text-align: left; }
      .nextstock-mobile-nav .sidebar .menu { display: block !important; }
      .nextstock-mobile-nav .sidebar .menu-item { display: block !important; margin: 3px 0; padding: 0; font-size: 16px !important; }
      .nextstock-mobile-nav .sidebar .menu-item a { display: flex; align-items: center; min-height: 44px; padding: 8px 12px; box-sizing: border-box; }
      .nextstock-mobile-nav main, .nextstock-mobile-nav .main, .nextstock-mobile-nav .page, .nextstock-mobile-nav .main-content { width: 100% !important; min-width: 0 !important; max-width: 100% !important; margin-left: 0 !important; box-sizing: border-box; }
      .nextstock-mobile-nav .mobile-sidebar-toggle, .nextstock-mobile-nav #toggleSidebarBtn { display: none !important; }
      #nextstock-mobile-header { display: flex; position: fixed; inset: 0 0 auto; z-index: 10000; height: calc(64px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 16px 0; box-sizing: border-box; align-items: center; gap: 14px; background: #071b31; color: #fff; border-bottom: 1px solid #254455; font: 600 16px/1.25 system-ui, sans-serif; }
      #nextstock-mobile-header button, #nextstock-mobile-close { min-width: 44px; min-height: 44px; border: 1px solid #43c5c8; border-radius: 8px; background: #00c5c9; color: #071b31; font: 700 16px system-ui, sans-serif; padding: 8px 12px; cursor: pointer; }
      #nextstock-mobile-close { display: block; margin: 0 0 12px auto; }
      #nextstock-mobile-backdrop:not([hidden]) { display: block; position: fixed; inset: 0; z-index: 10001; background: rgb(0 0 0 / 55%); border: 0; width: 100%; height: 100dvh; }
      body.nav-drawer-open { overflow: hidden !important; }
      #nextstock-mobile-header button:focus-visible, #nextstock-mobile-close:focus-visible, .sidebar a:focus-visible { outline: 3px solid #ffd166; outline-offset: 2px; }
    }
    @media (min-width: 769px), (orientation: landscape) { #nextstock-mobile-close { display: none; } }
  `;
  document.head.appendChild(style);
  const header = document.createElement('header');
  header.id = 'nextstock-mobile-header';
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.textContent = '☰ Menu';
  toggle.setAttribute('aria-controls', 'sidebar-container');
  const title = document.createElement('span');
  title.textContent = 'NextStock';
  header.append(toggle, title);
  const backdrop = document.createElement('div');
  backdrop.id = 'nextstock-mobile-backdrop'; backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.append(header, backdrop);
  let open = false;
  const setOpen = (value: boolean, restoreFocus = true) => {
    open = value && query.matches;
    document.body.classList.toggle('nav-drawer-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    container.inert = query.matches && !open;
    if (open) {
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-modal', 'true');
      container.setAttribute('aria-label', 'Menu de navegação');
      container.querySelector<HTMLButtonElement>('#nextstock-mobile-close')?.focus();
    } else {
      container.removeAttribute('role'); container.removeAttribute('aria-modal'); container.removeAttribute('aria-label');
      if (restoreFocus && query.matches) toggle.focus();
    }
  };
  const decorate = () => {
    const sidebar = container.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) return;
    if (!sidebar.querySelector('#nextstock-mobile-close')) {
      const close = document.createElement('button');
      close.id = 'nextstock-mobile-close'; close.type = 'button'; close.textContent = 'Fechar ×';
      close.addEventListener('click', () => setOpen(false));
      sidebar.prepend(close);
      if (open) close.focus();
    }
    title.textContent = container.querySelector('[aria-current="page"]')?.textContent?.trim() || 'NextStock';
  };
  toggle.addEventListener('click', () => setOpen(!open));
  backdrop.addEventListener('click', () => setOpen(false));
  container.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a[href]:not([aria-disabled="true"])')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const items = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]:not([aria-disabled="true"])')).filter((item) => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  const sync = () => { document.body.classList.toggle('nextstock-mobile-nav', query.matches); setOpen(false, false); };
  query.addEventListener('change', sync);
  new MutationObserver(decorate).observe(container, { childList: true, subtree: true });
  sync(); decorate();
}
