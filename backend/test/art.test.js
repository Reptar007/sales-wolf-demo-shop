/**
 * Product art is hand-written SVG. A duplicated attribute makes the whole file
 * invalid XML, and the browser shows a broken image — which on this site is
 * indistinguishable from the image_404 chaos flag. Catch it here instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_ART, categoryArt, productArt } from '../src/commerce/art.js';
import { buildProducts } from '../src/seed/data.js';

function problemsIn(svg) {
  const problems = [];
  for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map((m) => m[1]);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) problems.push(`duplicate "${dup}" in ${tag.slice(0, 50)}`);
  }
  if (/undefined|NaN/.test(svg)) problems.push('contains undefined/NaN');
  const opens = (svg.match(/<g[\s>]/g) || []).length;
  const closes = (svg.match(/<\/g>/g) || []).length;
  if (opens !== closes) problems.push('unbalanced <g>');
  return problems;
}

test('every product image composition is well-formed SVG', () => {
  const problems = [];
  for (const product of buildProducts()) {
    for (const n of [1, 2, 3]) {
      const svg = productArt({ ...product, category: { slug: product.categorySlug } }, n);
      for (const p of problemsIn(svg)) problems.push(`${product.slug}#${n}: ${p}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every category tile image is well-formed SVG', () => {
  for (const slug of Object.keys(CATEGORY_ART)) {
    assert.deepEqual(problemsIn(categoryArt(slug)), [], slug);
  }
  assert.equal(categoryArt('not-a-category'), null);
});

test('product names are escaped into the SVG label', () => {
  const svg = productArt({ slug: 'x', name: 'Tom & "Jerry" <3', hue: 10 }, 1);
  assert.match(svg, /aria-label="Tom &amp; &quot;Jerry&quot; &lt;3"/);
});
