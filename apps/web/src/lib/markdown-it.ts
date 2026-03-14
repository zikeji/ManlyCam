import 'highlight.js/styles/atom-one-dark.css';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type Renderer from 'markdown-it/lib/renderer.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type { Options } from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import html from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('html', html);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('php', php);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);

const SAFE_URL = /^https?:\/\//i;

/** Minimal HTML escaper to avoid circular reference with md.utils.escapeHtml inside highlight() */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(str: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
    } catch {
      /* fallthrough */
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
}

export const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true, // Convert single newlines to <br> (AC #10: preserve single line breaks)
  highlight,
});

// Custom inline strikethrough rule for ~~text~~ (AC #6)
// markdown-it does not include strikethrough natively; implemented as a custom inline rule
md.inline.ruler.push('custom_strikethrough', (state: StateInline, silent: boolean): boolean => {
  const start = state.pos;

  if (state.src.charCodeAt(start) !== 0x7e /* ~ */ || state.src.charCodeAt(start + 1) !== 0x7e) {
    return false;
  }

  const closePos = state.src.indexOf('~~', start + 2);
  if (closePos < 0) return false;

  if (!silent) {
    const open: Token = state.push('s_open', 's', 1);
    open.markup = '~~';
    const text: Token = state.push('text', '', 0);
    text.content = state.src.slice(start + 2, closePos);
    const close: Token = state.push('s_close', 's', -1);
    close.markup = '~~';
  }

  state.pos = closePos + 2;
  return true;
});

// Custom link renderer: add target="_blank", rel="noopener noreferrer", sanitize href (AC #4, #11)
const defaultLinkRenderer =
  md.renderer.rules.link_open ||
  ((tokens: Token[], idx: number, options: Options, _env: unknown, self: Renderer): string =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (
  tokens: Token[],
  idx: number,
  options: Options,
  env: unknown,
  self: Renderer,
): string => {
  const token = tokens[idx];

  // Sanitize href
  const hrefIndex = token.attrIndex('href');
  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1];
    if (!SAFE_URL.test(href)) {
      token.attrs![hrefIndex][1] = '#';
    }
  }

  // target="_blank"
  const targetIndex = token.attrIndex('target');
  if (targetIndex < 0) {
    token.attrPush(['target', '_blank']);
  } else {
    token.attrs![targetIndex][1] = '_blank';
  }

  // rel="noopener noreferrer"
  const relIndex = token.attrIndex('rel');
  if (relIndex < 0) {
    token.attrPush(['rel', 'noopener noreferrer']);
  } else {
    token.attrs![relIndex][1] = 'noopener noreferrer';
  }

  return defaultLinkRenderer(tokens, idx, options, env, self);
};

// Custom image renderer: sanitize src (only allow http/https) (AC #7, #11)
md.renderer.rules.image = (
  tokens: Token[],
  idx: number,
  options: Options,
  env: unknown,
  self: Renderer,
): string => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0) {
    const src = token.attrs![srcIndex][1];
    if (!SAFE_URL.test(src)) {
      token.attrs![srcIndex][1] = '#';
    }
  }
  // Set alt attribute from children (same as default markdown-it image renderer)
  const altIndex = token.attrIndex('alt');
  if (altIndex >= 0) {
    token.attrs![altIndex][1] = self.renderInlineAsText(token.children ?? [], options, env);
  }
  return self.renderToken(tokens, idx, options);
};
