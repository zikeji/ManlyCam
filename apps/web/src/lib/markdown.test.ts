import { describe, it, expect } from 'vitest';
import { renderMarkdownLite } from './markdown';

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
