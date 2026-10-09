const test = require('node:test');
const assert = require('node:assert');
const { compute } = require('../solver.js');

const answers = (p) => compute(p).answers.map((a) => a.text);

test('arithmetic', () => {
  assert.deepStrictEqual(answers('(2 + 3) × 4 − 6 ÷ 2'), ['17']);
  assert.deepStrictEqual(answers('√144 + 2^5'), ['44']);
  assert.deepStrictEqual(answers('1/3 + 1/6'), ['1/2']);
  assert.deepStrictEqual(answers('-2^2'), ['−4']);
});

test('linear equations', () => {
  assert.deepStrictEqual(answers('2x + 3 = 11'), ['x = 4']);
  assert.deepStrictEqual(answers('3(x − 2) = 2x + 7'), ['x = 13']);
  assert.deepStrictEqual(answers('2x = 7'), ['x = 7/2']);
});

test('quadratic equations', () => {
  assert.deepStrictEqual(answers('x² − 5x + 6 = 0'), ['x = 2', 'x = 3']);
  assert.deepStrictEqual(answers('x² − 3x + 1 = 0'), ['x = (3 − √5) / 2', 'x = (3 + √5) / 2']);
  assert.deepStrictEqual(answers('x² + 2x + 5 = 0'), ['x = −1 − 2i', 'x = −1 + 2i']);
  assert.deepStrictEqual(answers('(x-1)^2=0'), ['x = 1']);
});

test('higher degree and non-polynomial equations', () => {
  assert.deepStrictEqual(answers('x³ − 6x² + 11x − 6 = 0'), ['x = 1', 'x = 2', 'x = 3']);
  assert.deepStrictEqual(answers('5/x = 2'), ['x ≈ 2.5']);
  assert.ok(answers('sin(x) = 0.5').includes('x ≈ 0.523599'));
});

test('special cases', () => {
  assert.strictEqual(compute('x = x').kindLabel, 'Identity');
  assert.strictEqual(compute('x + 1 = x').kindLabel, 'No solution');
  assert.deepStrictEqual(answers('2+2=5'), ['False']);
  assert.deepStrictEqual(answers('(x + 1)^3'), ['x³ + 3x² + 3x + 1']);
});

test('errors are reported, not thrown', () => {
  assert.strictEqual(compute('1/0').error, 'Division by zero is undefined.');
  assert.ok(compute('2x+').isError);
  assert.ok(compute('y = 2').isError);
  assert.ok(compute('').isError);
});
