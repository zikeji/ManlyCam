const SAFE_URL = /^https?:\/\//i;

function sanitizeHref(url: string): string {
  return SAFE_URL.test(url) ? url : '#';
}

export function renderMarkdownLite(text: string): string {
  // Escape HTML first to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return (
    escaped
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Inline code: `text`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links: [label](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const href = sanitizeHref(url);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      })
  );
}
