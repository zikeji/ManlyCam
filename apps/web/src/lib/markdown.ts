import { md } from './markdown-it';

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

/**
 * Collapses 3+ consecutive newlines to 2 outside of code blocks (spam prevention).
 * Newlines inside fenced code blocks (``` delimited) are preserved exactly.
 * AC #8, #9.
 */
export function normalizeNewlines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let consecutiveEmpty = 0;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      consecutiveEmpty = 0;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
    } else {
      if (line.trim() === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty <= 2) {
          result.push(line);
        }
        // Skip if consecutiveEmpty > 2 (spam prevention)
      } else {
        consecutiveEmpty = 0;
        result.push(line);
      }
    }
  }

  return result.join('\n');
}

/**
 * Auto-closes any unclosed fenced code block by appending a closing ```.
 * This ensures markdown-it can render the code block even if the user forgot
 * to close it (AC #2).
 */
export function autoCloseCodeBlocks(text: string): string {
  const lines = text.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
  }

  return inCodeBlock ? text + '\n```' : text;
}

/**
 * Full markdown renderer using markdown-it + highlight.js.
 * Supports: fenced code blocks with syntax highlighting, blockquotes,
 * auto-links, italics, strikethrough, images, bold, inline code, single line breaks.
 * XSS-safe: html disabled, href/src sanitized.
 */
export function renderMarkdown(text: string): string {
  const normalized = normalizeNewlines(text);
  const closed = autoCloseCodeBlocks(normalized);
  return md.render(closed);
}
