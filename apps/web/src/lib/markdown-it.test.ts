import { describe, it, expect } from 'vitest';
import { md } from './markdown-it';

describe('markdown-it custom rules', () => {
  describe('custom_strikethrough inline rule', () => {
    it('renders ~~text~~ as <s>text</s>', () => {
      const result = md.render('~~strikethrough~~');
      expect(result).toContain('<s>');
      expect(result).toContain('strikethrough');
      expect(result).toContain('</s>');
    });

    it('leaves unclosed ~~ as plain text (no closing delimiter)', () => {
      const result = md.render('~~no closing');
      expect(result).not.toContain('<s>');
      expect(result).toContain('~~no closing');
    });

    it('ignores lone ~ (single tilde)', () => {
      const result = md.render('~single~');
      expect(result).not.toContain('<s>');
    });

    it('handles multiple strikethrough spans in one paragraph', () => {
      const result = md.render('~~foo~~ and ~~bar~~');
      expect(result).toContain('<s>');
    });
  });

  describe('link renderer', () => {
    it('adds target="_blank" and rel="noopener noreferrer" to links', () => {
      const result = md.render('[link](https://example.com)');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('replaces non-http/https href with #', () => {
      const result = md.render('[click](ftp://example.com)');
      expect(result).toContain('href="#"');
    });

    it('allows https links through', () => {
      const result = md.render('[link](https://safe.example.com)');
      expect(result).toContain('href="https://safe.example.com"');
    });

    it('preserves target="_blank" when link already has a target', () => {
      const result = md.render('[link](https://example.com)');
      expect(result).toContain('target="_blank"');
    });
  });

  describe('image renderer', () => {
    it('allows https image src', () => {
      const result = md.render('![alt](https://example.com/img.png)');
      expect(result).toContain('src="https://example.com/img.png"');
    });

    it('replaces non-http/https image src with #', () => {
      const result = md.render('![alt](ftp://example.com/img.png)');
      expect(result).toContain('src="#"');
    });
  });

  describe('highlight (code blocks)', () => {
    it('renders fenced code block with hljs wrapper', () => {
      const result = md.render('```js\nconsole.log("hi");\n```');
      expect(result).toContain('hljs-wrapper');
    });

    it('falls back to escaped plain text for unknown language', () => {
      const result = md.render('```unknownlang\nsome code\n```');
      expect(result).toContain('hljs-wrapper');
      expect(result).toContain('some code');
    });
  });
});
