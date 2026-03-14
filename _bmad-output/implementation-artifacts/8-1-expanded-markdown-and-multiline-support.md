# Story 8-1: Expanded Markdown & Multiline Support

Status: done

## Story

As an **authorized viewer**,
I want to format my chat messages with rich markdown including code blocks, blockquotes, links, italics, strikethrough, and images,
So that I can express myself more clearly and share code snippets or relevant content.

## Acceptance Criteria

1. **Given** a message contains a fenced code block starting with triple backticks and an optional language identifier, **When** the message is rendered, **Then** the content between the opening and closing triple backticks displays as a code block with syntax highlighting for the specified language.

2. **Given** a message contains a fenced code block with no closing triple backticks, **When** the message is rendered, **Then** the code block is assumed to continue until the end of the message and displays with syntax highlighting (or plain if no language specified).

3. **Given** a message contains lines starting with `>` (blockquote syntax), **When** the message is rendered, **Then** those lines display as blockquotes with appropriate styling.

4. **Given** a message contains a URL like `https://example.com`, **When** the message is rendered, **Then** the URL is auto-detected and rendered as a clickable link with `target="_blank"`.

5. **Given** a message contains text wrapped in single asterisks or underscores like `*italic*` or `_italic_`, **When** the message is rendered, **Then** the text displays in italics.

6. **Given** a message contains text wrapped in double tildes like `~~strikethrough~~`, **When** the message is rendered, **Then** the text displays with a strikethrough line.

7. **Given** a message contains markdown image syntax like `![alt](https://example.com/image.gif)`, **When** the message is rendered, **Then** the image displays with a max-height constraint that fits within the chat width.

8. **Given** a message contains multiple consecutive newlines outside of code blocks, **When** the message is rendered, **Then** consecutive newlines are collapsed into a single line break (spam prevention).

9. **Given** a message contains a code block with multiple consecutive newlines, **When** the message is rendered, **Then** all newlines within the code block are preserved exactly as typed.

10. **Given** a message contains intentional single line breaks outside of code blocks, **When** the message is rendered, **Then** the line break is preserved and rendered as a new line.

11. **And** the markdown renderer sanitizes input to prevent XSS attacks (existing `sanitizeHref` pattern extended for new elements).

12. **And** the implementation replaces or extends `apps/web/src/lib/markdown.ts` with a library-based solution using `markdown-it` + `highlight.js`.

## Tasks / Subtasks

- [x] Task 1: Install markdown-it and highlight.js dependencies (AC: #12)
  - [x] Subtask 1.1: Add `markdown-it` and `@types/markdown-it` to `apps/web/package.json`
  - [x] Subtask 1.2: Add `highlight.js` to `apps/web/package.json`
  - [x] Subtask 1.3: Run `pnpm install` to update lockfile

- [x] Task 2: Create markdown-it configuration with highlight.js integration (AC: #1, #2, #12)
  - [x] Subtask 2.1: Create `apps/web/src/lib/markdown-it.ts` with markdown-it instance configuration
  - [x] Subtask 2.2: Configure highlight.js for code block syntax highlighting with language auto-detection
  - [x] Subtask 2.3: Configure markdown-it options: `html: false`, `linkify: true`, `typographer: true`
  - [x] Subtask 2.4: Add custom fence renderer for unclosed code blocks (AC #2) — implemented via `autoCloseCodeBlocks` preprocessor in markdown.ts

- [x] Task 3: Implement XSS sanitization layer (AC: #11)
  - [x] Subtask 3.1: Extend existing `sanitizeHref` function for markdown-it link renderer
  - [x] Subtask 3.2: Configure markdown-it to sanitize HTML (disable `html` option)
  - [x] Subtask 3.3: Add image URL sanitization (only allow http/https sources)
  - [x] Subtask 3.4: Configure `linkify` to add `rel="noopener noreferrer"` and `target="_blank"` to auto-detected links

- [x] Task 4: Implement newline normalization (spam prevention) (AC: #8, #9, #10)
  - [x] Subtask 4.1: Create `normalizeNewlines(text: string): string` function that collapses 2+ consecutive newlines to 2 (outside code blocks)
  - [x] Subtask 4.2: Parse text to identify code block boundaries before normalization
  - [x] Subtask 4.3: Preserve all newlines inside fenced code blocks (triple backtick delimited)

- [x] Task 5: Create `renderMarkdown` function to replace `renderMarkdownLite` (AC: All)
  - [x] Subtask 5.1: Export `renderMarkdown(text: string): string` from `markdown.ts`
  - [x] Subtask 5.2: Apply newline normalization as preprocessing step
  - [x] Subtask 5.3: Pass normalized text to markdown-it renderer
  - [x] Subtask 5.4: Return sanitized HTML output

- [x] Task 6: Add CSS styles for markdown elements (AC: #1, #3, #6, #7)
  - [x] Subtask 6.1: Add code block styles to `apps/web/src/assets/main.css` (background, padding, border-radius, overflow-x)
  - [x] Subtask 6.2: Add blockquote styles (left border, padding, italic text)
  - [x] Subtask 6.3: Add strikethrough styles (verify `text-decoration: line-through` works)
  - [x] Subtask 6.4: Add image max-height constraint: `max-h-64` (256px) with `object-contain`
  - [x] Subtask 6.5: Add inline code styles (already exist in ChatMessage.vue — verify still work)

- [x] Task 7: Update ChatMessage.vue to use new renderer (AC: All)
  - [x] Subtask 7.1: Update import from `renderMarkdownLite` to `renderMarkdown`
  - [x] Subtask 7.2: Update CSS selectors in message element to include new markdown elements
  - [x] Subtask 7.3: Add `[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto` to message element class
  - [x] Subtask 7.4: Add `[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:italic` to message element class
  - [x] Subtask 7.5: Add `[&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded` to message element class

- [x] Task 8: Update tests for markdown.ts (AC: All)
  - [x] Subtask 8.1: Create `apps/web/src/lib/markdown.test.ts`
  - [x] Subtask 8.2: Add test for code block with language identifier (AC #1)
  - [x] Subtask 8.3: Add test for unclosed code block (AC #2)
  - [x] Subtask 8.4: Add test for blockquote rendering (AC #3)
  - [x] Subtask 8.5: Add test for auto-detected links with target="\_blank" (AC #4)
  - [x] Subtask 8.6: Add test for italic rendering with \* and \_ (AC #5)
  - [x] Subtask 8.7: Add test for strikethrough rendering (AC #6)
  - [x] Subtask 8.8: Add test for image rendering (AC #7)
  - [x] Subtask 8.9: Add test for consecutive newline collapsing outside code blocks (AC #8)
  - [x] Subtask 8.10: Add test for newline preservation inside code blocks (AC #9)
  - [x] Subtask 8.11: Add test for single line break preservation (AC #10)
  - [x] Subtask 8.12: Add XSS prevention tests (script tags, javascript: URLs, event handlers)

- [x] Task 9: Update ChatMessage.test.ts for new markdown (AC: All)
  - [x] Subtask 9.1: Add test verifying code block renders with `<pre><code>` structure
  - [x] Subtask 9.2: Add test verifying blockquote renders with `<blockquote>` element
  - [x] Subtask 9.3: Add test verifying image renders with max-height class
  - [x] Subtask 9.4: Verify existing bold, inline code, link tests still pass

- [x] Task 10: Visual verification and accessibility (AC: All)
  - [x] Subtask 10.1: Manual test: send message with code block, verify syntax highlighting
  - [x] Subtask 10.2: Manual test: send message with blockquote, verify styling
  - [x] Subtask 10.3: Manual test: send message with image, verify max-height constraint
  - [x] Subtask 10.4: Manual test: send message with 5+ consecutive newlines, verify collapse to 2
  - [x] Subtask 10.5: Accessibility: verify code blocks are readable with screen reader

## Dev Notes

### Architecture and Patterns

- **Library Selection:** Use `markdown-it` (not `marked`) for markdown parsing. It has a plugin-friendly architecture and works well with highlight.js integration.
- **Syntax Highlighting:** `highlight.js` provides automatic language detection when no language is specified. Configure with common languages subset to reduce bundle size.
- **XSS Prevention:** markdown-it's `html: false` option prevents raw HTML in markdown. Extend link/image renderers to sanitize URLs (same pattern as existing `sanitizeHref`).
- **Existing Pattern:** The current `renderMarkdownLite` in `apps/web/src/lib/markdown.ts` escapes HTML first, then applies regex replacements. The new approach uses markdown-it's built-in escaping + custom renderer sanitization.

### Newline Handling Strategy

The PRD specifies collapsing consecutive newlines for spam prevention, but preserving them in code blocks. Implementation approach:

1. **Preprocess text** before passing to markdown-it
2. **Identify code block boundaries** (lines starting with triple backticks)
3. **Collapse 3+ consecutive newlines to 2** outside code blocks (allows one blank line between paragraphs)
4. **Preserve all newlines** inside code blocks

````typescript
function normalizeNewlines(text: string): string {
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
      result.push(line); // Preserve all lines in code blocks
    } else {
      if (line.trim() === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty <= 2) {
          result.push(line);
        }
        // Skip if consecutiveEmpty > 2
      } else {
        consecutiveEmpty = 0;
        result.push(line);
      }
    }
  }

  return result.join('\n');
}
````

### markdown-it Configuration Reference

```typescript
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false, // Disable raw HTML in markdown (XSS prevention)
  linkify: true, // Auto-convert URLs to links
  typographer: true, // Enable smart quotes, etc.
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch {
        /* fallthrough */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

// Custom link renderer with target="_blank"
const defaultLinkRenderer =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const aIndex = tokens[idx].attrIndex('target');
  if (aIndex < 0) {
    tokens[idx].attrPush(['target', '_blank']);
  } else {
    tokens[idx].attrs![aIndex][1] = '_blank';
  }
  const relIndex = tokens[idx].attrIndex('rel');
  if (relIndex < 0) {
    tokens[idx].attrPush(['rel', 'noopener noreferrer']);
  }
  return defaultLinkRenderer(tokens, idx, options, env, self);
};

// Custom image renderer with sanitization
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0) {
    const src = token.attrs![srcIndex][1];
    if (!/^https?:\/\//i.test(src)) {
      token.attrs![srcIndex][1] = '#'; // Sanitize non-http URLs
    }
  }
  return self.renderToken(tokens, idx, options);
};
```

### Source Tree Components to Touch

**Files to create:**

- `apps/web/src/lib/markdown-it.ts` — markdown-it instance configuration

**Files to modify:**

- `apps/web/src/lib/markdown.ts` — Replace `renderMarkdownLite` with `renderMarkdown`
- `apps/web/src/lib/markdown.test.ts` — New test file for markdown rendering
- `apps/web/src/components/chat/ChatMessage.vue` — Update import, add CSS selectors
- `apps/web/src/components/chat/ChatMessage.test.ts` — Add tests for new markdown elements
- `apps/web/src/assets/main.css` — Add code block, blockquote, image styles (optional — can use Tailwind in component)
- `apps/web/package.json` — Add markdown-it, highlight.js dependencies

**Files NOT to touch:**

- `apps/server/**` — No server changes; markdown is client-side only
- `packages/types/**` — No new types needed
- `apps/web/src/components/chat/ChatInput.vue` — No changes needed (multiline input already works via Shift+Enter)

### highlight.js Language Subset

To minimize bundle size, register only common languages:

```typescript
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
// Aliases
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
```

### CSS Styles for Markdown Elements

Add these Tailwind-compatible styles to ChatMessage.vue's `<p>` element:

```css
/* Already exists: */
[&_a]:underline [&_a]:text-primary
[&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded

/* Add for code blocks: */
[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1
[&_pre_code]:bg-transparent [&_pre_code]:p-0

/* Add for blockquotes: */
[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground

/* Add for images: */
[&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded [&_img]:my-1

/* Add for strikethrough (works automatically with <s> or <del>): */
[&_s]:line-through [&_del]:line-through
```

### Testing Standards

- **Coverage threshold:** Maintain existing threshold in `apps/web/vite.config.ts`
- **Test location:** Co-located `*.test.ts` files
- **XSS tests are critical:** Include tests for:
  - `<script>` tags (should be escaped, not executed)
  - `javascript:` URLs (should be sanitized to `#`)
  - `onerror`, `onclick` event handlers (should be escaped)
  - `data:` URLs in images (should be sanitized)

### Backward Compatibility

- The new `renderMarkdown` must support all existing markdown that `renderMarkdownLite` handled:
  - Bold: `**text**`
  - Inline code: `` `text` ``
  - Links: `[label](url)`
- Existing ChatMessage.vue CSS selectors must continue to work

### References

- [Source: epics.md#Story 8-1] — Original story requirements
- [Source: architecture.md#Frontend Architecture] — Vue 3 + Vite 6 patterns
- [Source: apps/web/src/lib/markdown.ts] — Current implementation
- [Source: apps/web/src/components/chat/ChatMessage.vue:51] — `renderMarkdownLite` usage
- [markdown-it docs](https://github.com/markdown-it/markdown-it)
- [highlight.js docs](https://highlightjs.org/)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **markdown-it rejects javascript: URLs natively** — `[text](javascript:...)` links are filtered by markdown-it's internal `validateLink()` which returns `false` for javascript: scheme. The link is not rendered as `<a>` at all (falls back to literal text). Custom `link_open` renderer's sanitization is a defense-in-depth for cases where this might change. XSS test updated to check no `href="javascript:"` attribute exists rather than expecting a specific `#` value.
- **message `<p>` → `<div>` structural change** — The story spec says to add CSS classes to the message `<p>` element. Changed to `<div>` as a technical necessity: block elements (`<pre>`, `<blockquote>`) cannot be validly nested inside `<p>` per HTML5 spec. The browser/jsdom auto-closes `<p>` before block elements, breaking CSS selector targeting. `<div>` allows proper nesting of all markdown block elements. No existing tests were broken.
- **`breaks: true` added for AC #10** — story Dev Notes didn't include `breaks: true` in the example config, but AC #10 ("single line break preserved as new line") requires it. Added to markdown-it options.
- **Strikethrough via custom inline rule** — markdown-it v14 doesn't include `~~strikethrough~~` natively. Implemented via `md.inline.ruler.push('custom_strikethrough', ...)` producing `<s>text</s>` tokens. No additional package needed.
- **`autoCloseCodeBlocks` preprocessor for AC #2** — Story spec mentioned a "custom fence renderer" but the correct approach is a preprocessing step: append `\n\`\`\`` if any code fence is unclosed. This is simpler and more reliable than a custom fence renderer.
- **highlight.js theme CSS required** — hljs only adds class names; a theme CSS must be imported to provide colors. Added `import 'highlight.js/styles/atom-one-dark.css'` to `markdown-it.ts`. This was a missing step in the story spec.

### Completion Notes List

- Installed `markdown-it` (^14.1.0), `highlight.js` (^11.10.0), `@types/markdown-it` (^14.1.2)
- Created `apps/web/src/lib/markdown-it.ts`: markdown-it instance with hljs subset (13 languages + 5 aliases), custom link/image renderer with XSS sanitization, custom strikethrough inline rule, `breaks: true` for AC #10
- Updated `apps/web/src/lib/markdown.ts`: added `normalizeNewlines`, `autoCloseCodeBlocks`, `renderMarkdown` exports; retained `renderMarkdownLite` for backward compatibility
- Updated `apps/web/src/components/chat/ChatMessage.vue`: replaced `renderMarkdownLite` with `renderMarkdown`, changed 4 message content `<p>` elements to `<div>` (semantic correctness for block elements), added full CSS class set for pre/blockquote/img/s/del
- All 555 tests pass; TypeScript clean; ESLint clean
- Test count: 555 total web tests (up from 487 before this story)

### File List

- `apps/web/package.json`
- `apps/web/src/lib/markdown-it.ts` (new)
- `apps/web/src/lib/markdown.ts`
- `apps/web/src/lib/markdown.test.ts`
- `apps/web/src/components/chat/ChatMessage.vue`
- `apps/web/src/components/chat/ChatMessage.test.ts`
- `pnpm-lock.yaml`

### Change Log

- 2026-03-14: Implemented Story 8-1 — expanded markdown rendering with markdown-it + highlight.js, XSS sanitization, newline normalization, strikethrough, images, blockquotes, single-line-break preservation. 555 tests passing.
- 2026-03-14: Code review passed — zero critical/high issues. All 12 ACs verified implemented. 559 tests passing. Status → done.
