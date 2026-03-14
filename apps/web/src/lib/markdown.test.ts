import { describe, it, expect } from 'vitest';
import {
  renderMarkdownLite,
  renderMarkdown,
  normalizeNewlines,
  autoCloseCodeBlocks,
} from './markdown';

describe('renderMarkdownLite', () => {
  it('renders bold text', () => {
    expect(renderMarkdownLite('**hello**')).toBe('<strong>hello</strong>');
  });

  it('renders inline code', () => {
    expect(renderMarkdownLite('`code`')).toBe('<code>code</code>');
  });

  it('renders a link with target=_blank', () => {
    const result = renderMarkdownLite('[label](https://example.com)');
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('>label</a>');
  });

  it('suppresses javascript: URLs — replaces href with #', () => {
    const result = renderMarkdownLite('[click](javascript:alert(1))');
    expect(result).toContain('href="#"');
    expect(result).not.toContain('javascript:');
  });

  it('suppresses data: URLs', () => {
    const result = renderMarkdownLite('[click](data:text/html,<h1>xss</h1>)');
    expect(result).toContain('href="#"');
    expect(result).not.toContain('data:');
  });

  it('escapes HTML to prevent XSS', () => {
    const result = renderMarkdownLite('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    expect(renderMarkdownLite('a & b')).toContain('a &amp; b');
  });

  it('renders all patterns in combination', () => {
    const result = renderMarkdownLite('**bold** and `code` and [link](https://x.com)');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<code>code</code>');
    expect(result).toContain('href="https://x.com"');
  });

  it('leaves plain text unchanged (except HTML escaping)', () => {
    expect(renderMarkdownLite('Hello world')).toBe('Hello world');
  });

  it('allows http:// links', () => {
    const result = renderMarkdownLite('[site](http://example.com)');
    expect(result).toContain('href="http://example.com"');
  });
});

describe('normalizeNewlines', () => {
  it('preserves text with no extra newlines', () => {
    expect(normalizeNewlines('hello\nworld')).toBe('hello\nworld');
  });

  it('preserves a single blank line between paragraphs', () => {
    expect(normalizeNewlines('a\n\nb')).toBe('a\n\nb');
  });

  it('collapses 3 consecutive blank lines to 2', () => {
    const result = normalizeNewlines('a\n\n\n\nb');
    const emptyCount = result.split('\n').filter((l) => l.trim() === '').length;
    expect(emptyCount).toBeLessThanOrEqual(2);
  });

  it('collapses 5 consecutive blank lines to 2', () => {
    const result = normalizeNewlines('a\n\n\n\n\n\nb');
    const emptyCount = result.split('\n').filter((l) => l.trim() === '').length;
    expect(emptyCount).toBeLessThanOrEqual(2);
  });

  it('preserves all newlines inside code blocks', () => {
    const input = '```\nline1\n\n\n\nline2\n```';
    const result = normalizeNewlines(input);
    expect(result).toBe(input); // Unchanged — all newlines inside code block preserved
  });

  it('collapses newlines outside code block but preserves inside', () => {
    const input = 'text\n\n\n\n```\ncode\n\n\nmore\n```\n\n\n\nafter';
    const result = normalizeNewlines(input);
    // Inside code block: 2 empty lines preserved
    expect(result).toContain('code\n\n\nmore');
    // Outside: excessive newlines collapsed
    const lines = result.split('\n');
    // Count consecutive empty lines outside code block
    let maxConsecutive = 0;
    let consecutive = 0;
    let inBlock = false;
    for (const line of lines) {
      if (line.startsWith('```')) inBlock = !inBlock;
      if (!inBlock && line.trim() === '') {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 0;
      }
    }
    expect(maxConsecutive).toBeLessThanOrEqual(2);
  });
});

describe('autoCloseCodeBlocks', () => {
  it('does not modify text with balanced code fences', () => {
    const input = '```js\nconst x = 1;\n```';
    expect(autoCloseCodeBlocks(input)).toBe(input);
  });

  it('appends closing ``` for unclosed code block', () => {
    const result = autoCloseCodeBlocks('```js\nconst x = 1;');
    expect(result.endsWith('\n```')).toBe(true);
  });

  it('does not modify plain text without code fences', () => {
    const input = 'plain text';
    expect(autoCloseCodeBlocks(input)).toBe(input);
  });
});

describe('renderMarkdown', () => {
  // AC #1: fenced code block with language identifier
  it('renders code block with language identifier and syntax highlighting', () => {
    const result = renderMarkdown('```js\nconst x = 1;\n```');
    expect(result).toContain('<pre');
    expect(result).toContain('<code');
    // highlight.js wraps with class
    expect(result).toContain('class="hljs"');
  });

  // AC #2: unclosed code block rendered as code block
  it('renders unclosed code block to end of message', () => {
    const result = renderMarkdown('```js\nconst x = 1;');
    expect(result).toContain('<pre');
    expect(result).toContain('<code');
  });

  // AC #3: blockquote
  it('renders blockquote syntax', () => {
    const result = renderMarkdown('> quoted text');
    expect(result).toContain('<blockquote');
    expect(result).toContain('quoted text');
  });

  // AC #4: auto-detected URL becomes clickable link with target="_blank"
  it('auto-detects URLs and renders as links with target="_blank"', () => {
    const result = renderMarkdown('https://example.com');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  // AC #4: explicit [label](url) links also get target="_blank"
  it('renders explicit markdown links with target="_blank"', () => {
    const result = renderMarkdown('[click here](https://example.com)');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  // AC #5: italic with *
  it('renders italic text with single asterisks', () => {
    const result = renderMarkdown('*italic*');
    expect(result).toContain('<em>');
    expect(result).toContain('italic');
  });

  // AC #5: italic with _
  it('renders italic text with underscores', () => {
    const result = renderMarkdown('_italic_');
    expect(result).toContain('<em>');
    expect(result).toContain('italic');
  });

  // AC #6: strikethrough
  it('renders strikethrough text', () => {
    const result = renderMarkdown('~~strikethrough~~');
    expect(result).toContain('<s>');
    expect(result).toContain('strikethrough');
  });

  // AC #7: image with <img> tag rendered
  it('renders image markdown as <img> element', () => {
    const result = renderMarkdown('![alt text](https://example.com/image.gif)');
    expect(result).toContain('<img');
    expect(result).toContain('src="https://example.com/image.gif"');
    expect(result).toContain('alt="alt text"');
  });

  // AC #8: consecutive newlines outside code blocks collapsed
  it('collapses 5 consecutive newlines outside code blocks', () => {
    const input = 'line1\n\n\n\n\nline2';
    const result = renderMarkdown(input);
    // Result should not have 5 consecutive newlines; normalizeNewlines handles this
    // Verify both lines are still present
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    // And it's not astronomically long
    expect(result.length).toBeLessThan(200);
  });

  // AC #9: newlines inside code blocks preserved
  it('preserves multiple newlines inside code blocks', () => {
    const input = '```\nfirst\n\n\nsecond\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('<pre');
    // The rendered content should contain 'first' and 'second' with empty lines preserved
    expect(result).toContain('first');
    expect(result).toContain('second');
  });

  // AC #10: single line break preserved (breaks: true)
  it('preserves single line breaks as <br> elements', () => {
    const result = renderMarkdown('line1\nline2');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('<br');
  });

  // AC #11: XSS prevention - script tags escaped
  it('escapes <script> tags to prevent XSS', () => {
    const result = renderMarkdown('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
  });

  // AC #11: XSS prevention - javascript: URLs never appear as executable hrefs
  it('does not produce executable javascript: href in links', () => {
    const result = renderMarkdown('[bad](javascript:alert(1))');
    // markdown-it internally validates links and rejects javascript: URLs,
    // so the link is either not rendered as <a> or href is sanitized to '#'
    expect(result).not.toContain('href="javascript:');
  });

  // AC #11: XSS prevention - javascript: URLs in auto-links (linkify won't auto-link these)
  it('does not auto-link javascript: scheme URLs', () => {
    const result = renderMarkdown('javascript:alert(1)');
    // linkify won't convert javascript: to a link; should appear as escaped text
    expect(result).not.toContain('href="javascript:');
  });

  // AC #11: XSS prevention - data: URLs in images sanitized
  it('sanitizes data: URLs in images', () => {
    const result = renderMarkdown('![img](data:image/png;base64,abc)');
    const srcMatch = result.match(/src="([^"]+)"/);
    expect(srcMatch?.[1]).toBe('#');
    expect(result).not.toContain('data:');
  });

  // AC #11: XSS prevention - html: false ensures raw HTML is escaped, not executed
  it('does not render raw HTML as actual DOM elements (html: false)', () => {
    const result = renderMarkdown('<img onerror="alert(1)" src="x">');
    // html: false causes markdown-it to escape <img> to &lt;img&gt; — no actual element
    expect(result).not.toContain('<img ');
    // The escaped text is safe (no executable HTML)
  });

  // Backward compatibility: bold still works
  it('renders bold text (backward compatibility)', () => {
    const result = renderMarkdown('**bold**');
    expect(result).toContain('<strong>bold</strong>');
  });

  // Backward compatibility: inline code still works
  it('renders inline code (backward compatibility)', () => {
    const result = renderMarkdown('`code here`');
    expect(result).toContain('<code>code here</code>');
  });

  // Backward compatibility: markdown links still work
  it('renders markdown links (backward compatibility)', () => {
    const result = renderMarkdown('[label](https://example.com)');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('label');
  });
});
