const DEFAULT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563eb"/><path d="M20 18h26v8H28v10h16v8H28v14h-8z" fill="#fff"/></svg>`;

export const DEFAULT_ICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(DEFAULT_ICON_SVG)}`;

export const applyBrandingIconsToHead = ({ faviconUrl = '', appleTouchUrl = '', manifestUrl = '' }) => {
  const head = document.head;
  if (!head) return;

  const links = [
    { selector: 'link[data-branding-icon="icon"]', rel: 'icon', href: faviconUrl || DEFAULT_ICON_DATA_URL, type: 'image/svg+xml' },
    { selector: 'link[data-branding-icon="shortcut"]', rel: 'shortcut icon', href: faviconUrl || DEFAULT_ICON_DATA_URL },
    { selector: 'link[data-branding-icon="apple"]', rel: 'apple-touch-icon', href: appleTouchUrl || faviconUrl || DEFAULT_ICON_DATA_URL },
    { selector: 'link[data-branding-icon="manifest"]', rel: 'manifest', href: manifestUrl || '' },
  ];

  links.forEach(({ selector, rel, href, type }) => {
    let node = head.querySelector(selector);
    if (!node) {
      node = document.createElement('link');
      node.setAttribute(
        'data-branding-icon',
        selector.includes('apple') ? 'apple' : selector.includes('shortcut') ? 'shortcut' : selector.includes('manifest') ? 'manifest' : 'icon'
      );
      head.appendChild(node);
    }

    node.setAttribute('rel', rel);
    if (href) {
      node.setAttribute('href', href);
    } else {
      node.removeAttribute('href');
    }
    if (type && !href.startsWith('blob:')) {
      node.setAttribute('type', type);
    } else {
      node.removeAttribute('type');
    }
  });
};
