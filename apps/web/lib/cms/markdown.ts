// SRS §4.8 — markdown → HTML pipeline for career-advice articles.
//
// unified + remark + rehype + Shiki + sanitize. The processor is built once
// per process and reused; Shiki bundle init is a few hundred ms otherwise.
// Async because Shiki loads grammars + themes lazily.
//
// Sanitize defaults reject `<script>`, `<style>`, raw HTML, and dangerous
// protocols (javascript:, data: in href/src) even though our authors are
// admin-authenticated — defense in depth, especially since articles are
// served as cached HTML to anonymous readers.

import rehypeShiki from '@shikijs/rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type Processor } from 'unified';
import type { Element, Root } from 'hast';

// Extend the default sanitize schema so Shiki's class-based highlight markup
// survives. Shiki emits <pre><code class="..."><span class="..."> with style
// attrs for inline colors; without these whitelisted, sanitize strips them
// and code blocks render as plain text.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    code: [...(defaultSchema.attributes?.['code'] ?? []), 'className', 'style'],
    span: [...(defaultSchema.attributes?.['span'] ?? []), 'className', 'style'],
    pre: [...(defaultSchema.attributes?.['pre'] ?? []), 'className', 'style', 'tabindex'],
    img: [
      ...(defaultSchema.attributes?.['img'] ?? []),
      'loading',
      'decoding',
      'width',
      'height',
    ],
  },
};

// Adds loading="lazy" + decoding="async" to every <img> so non-MDX markdown
// still gets browser-level perf hints. True next/image integration arrives
// with the MDX migration chip.
function rehypeImageHints() {
  return (tree: Root) => {
    const visit = (node: Root | Element): void => {
      if ('children' in node) {
        for (const child of node.children) {
          if (child.type === 'element') {
            const el = child as Element;
            if (el.tagName === 'img') {
              el.properties = { loading: 'lazy', decoding: 'async', ...el.properties };
            }
            visit(el);
          }
        }
      }
    };
    visit(tree);
  };
}

let processor: Processor<Root, Root, Root, Root, string> | null = null;

async function getProcessor(): Promise<Processor<Root, Root, Root, Root, string>> {
  if (processor) return processor;
  processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeImageHints)
    .use(rehypeShiki, {
      themes: { light: 'github-light', dark: 'github-dark' },
    })
    .use(rehypeSanitize, SANITIZE_SCHEMA)
    .use(rehypeStringify) as Processor<Root, Root, Root, Root, string>;
  return processor;
}

export async function renderArticleMarkdown(md: string): Promise<string> {
  const p = await getProcessor();
  const file = await p.process(md);
  return String(file);
}

// Test seam — drops the cached processor between tests so changes in the
// chain don't leak across test files.
export function _resetProcessor(): void {
  processor = null;
}
