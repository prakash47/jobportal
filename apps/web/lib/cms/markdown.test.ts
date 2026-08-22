import { beforeAll, describe, expect, it } from 'vitest';
import { renderArticleMarkdown } from './markdown';

// Shiki bundle init takes a few seconds the first time; warm it up once so
// the per-test 5s default doesn't trip on the first paragraph render. The
// processor is stateless after init, so we deliberately do NOT _resetProcessor
// between tests — that would re-init Shiki and 10× the suite runtime.
//
// 120s, raised from 30s. This hook loads Shiki's WASM engine and grammars, and
// its duration is a function of how busy the MACHINE is, not of anything this
// file asserts. Run alone it takes ~12s; run under a full root `pnpm test`,
// where Turborepo has ten workspaces' vitest instances competing for cores, it
// crossed 30s the moment feature/sadmin-roles-permissions added ~43 tests
// elsewhere in the repo — and then failed the whole gate from a file that
// change never touched.
//
// A timeout on a warmup hook is not an assertion: nothing here is verified by
// it, and a tight value only converts "this laptop is busy" into "the merge
// gate is red". The seven real assertions below keep their own timeouts.
beforeAll(async () => {
  await renderArticleMarkdown('warmup');
}, 120_000);

describe('renderArticleMarkdown', () => {
  it('renders a paragraph', async () => {
    const html = await renderArticleMarkdown('Hello **world**.');
    expect(html).toContain('<p>Hello <strong>world</strong>.</p>');
  });

  it('renders headings as h1..h6', async () => {
    const html = await renderArticleMarkdown('# Title\n\n## Subtitle');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Subtitle</h2>');
  });

  it('highlights fenced code blocks via Shiki (emits per-token color styles)', async () => {
    const html = await renderArticleMarkdown(
      '```ts\nconst x: number = 1;\n```',
    );
    // Shiki with multi-theme config emits inline CSS variables on <pre> and
    // per-token <span style="--shiki-light:#xxx;--shiki-dark:#xxx">. The exact
    // wrapping markup varies by version, so assert on the load-bearing
    // outputs: a <pre>, the source token content, and color styling somewhere.
    expect(html).toContain('<pre');
    expect(html).toContain('const');
    expect(html).toMatch(/style="[^"]*(?:color:|--shiki)/);
  });

  it('preserves http(s) links', async () => {
    const html = await renderArticleMarkdown('[Stripe](https://stripe.com)');
    expect(html).toContain('href="https://stripe.com"');
  });

  it('strips javascript: protocol from links (sanitize defense in depth)', async () => {
    const html = await renderArticleMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(1)');
  });

  it('adds loading="lazy" + decoding="async" to images', async () => {
    const html = await renderArticleMarkdown('![alt text](https://example.com/x.png)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('alt="alt text"');
  });

  it('renders GFM tables', async () => {
    const html = await renderArticleMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });
});
