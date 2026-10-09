const test = require('node:test');
const assert = require('node:assert');
const { compute, isWordProblem } = require('../solver.js');

const answers = (p) => {
  const r = compute(p);
  assert.ok(!r.isError, p + ' → ' + r.error);
  return r.answers.map((a) => a.text);
};

test('arithmetic', () => {
  assert.deepStrictEqual(answers('(2 + 3) × 4 − 6 ÷ 2'), ['17']);
  assert.deepStrictEqual(answers('√144 + 2^5'), ['44']);
  assert.deepStrictEqual(answers('1/3 + 1/6'), ['1/2']);
  assert.deepStrictEqual(answers('-2^2'), ['−4']);
  assert.deepStrictEqual(answers('5!'), ['120']);
  assert.deepStrictEqual(answers('15% of 80'), ['12']);
  assert.deepStrictEqual(answers('2,5 + 1,5'), ['4']);
  assert.deepStrictEqual(answers('What is 12 * 3?'), ['36']);
});

test('linear equations in any letter', () => {
  assert.deepStrictEqual(answers('2x + 3 = 11'), ['x = 4']);
  assert.deepStrictEqual(answers('3(x − 2) = 2x + 7'), ['x = 13']);
  assert.deepStrictEqual(answers('2x = 7'), ['x = 7/2']);
  assert.deepStrictEqual(answers('2y + 1 = 9'), ['y = 4']);
  assert.deepStrictEqual(answers('3t - 4 = 2t'), ['t = 4']);
});

test('quadratic equations', () => {
  assert.deepStrictEqual(answers('x² − 5x + 6 = 0'), ['x = 2', 'x = 3']);
  assert.deepStrictEqual(answers('x² − 3x + 1 = 0'), ['x = (3 − √5) / 2', 'x = (3 + √5) / 2']);
  assert.deepStrictEqual(answers('x² + 2x + 5 = 0'), ['x = −1 − 2i', 'x = −1 + 2i']);
  assert.deepStrictEqual(answers('(x-1)^2=0'), ['x = 1']);
});

test('higher degree and non-polynomial equations', () => {
  assert.deepStrictEqual(answers('x³ − 6x² + 11x − 6 = 0'), ['x = 1', 'x = 2', 'x = 3']);
  assert.deepStrictEqual(answers('(x-1)^2(x+2)=0'), ['x = −2', 'x = 1']);
  assert.deepStrictEqual(answers('5/x = 2'), ['x = 5/2']);
  assert.ok(answers('sin(x) = 0.5').includes('x ≈ 0.523599'));
});

test('inequalities', () => {
  assert.deepStrictEqual(answers('2x + 3 < 7'), ['x < 2']);
  assert.deepStrictEqual(answers('-3x + 1 ≥ 10'), ['x ≤ −3']);
  assert.deepStrictEqual(answers('x^2 - 5x + 6 < 0'), ['2 < x < 3']);
  assert.deepStrictEqual(answers('x^2 - 5x + 6 >= 0'), ['x ≤ 2  or  x ≥ 3']);
  assert.deepStrictEqual(answers('x^2 + 1 > 0'), ['Every real number']);
  assert.deepStrictEqual(answers('x^2 < 0'), ['No solution']);
  assert.deepStrictEqual(answers('x^2 <= 0'), ['x = 0']);
  assert.deepStrictEqual(answers('x != 3'), ['x ≠ 3']);
  assert.deepStrictEqual(answers('1/x > 2'), ['0 < x < 1/2']);
  assert.deepStrictEqual(answers('sqrt(x) < 3'), ['0 ≤ x < 9']);
  assert.deepStrictEqual(answers('(x-2)/(x+1) <= 0'), ['−1 < x ≤ 2']);
  assert.deepStrictEqual(answers('abs(x - 3) < 2'), ['1 < x < 5']);
  assert.ok(compute('2x + 3 < 7').note.includes('(−∞, 2)'));
});

test('double and combined inequalities', () => {
  assert.deepStrictEqual(answers('1 < 2x + 3 ≤ 7'), ['−1 < x ≤ 2']);
  assert.deepStrictEqual(answers('-2 <= 3 - x < 4'), ['−1 < x ≤ 5']);
  assert.deepStrictEqual(answers('x > 1 and x < 5'), ['1 < x < 5']);
  assert.ok(compute('1 < x > 2').isError);
});

test('systems of equations', () => {
  assert.deepStrictEqual(answers('a + b = 10; a - b = 2'), ['a = 6', 'b = 4']);
  assert.deepStrictEqual(answers('x + y + z = 6\nx - y = 0\nx + z = 4'), ['x = 2', 'y = 2', 'z = 2']);
  assert.deepStrictEqual(answers('x + y = 3, x + y = 4'), ['No solution']);
  assert.strictEqual(compute('x + y = 3; 2x + 2y = 6').kindLabel, 'Linear system');
  assert.ok(compute('x + y = 3; 2x + 2y = 6').note.startsWith('Infinitely many'));
  assert.deepStrictEqual(answers('x + y = 5, xy = 6'), ['x = 3,  y = 2', 'x = 2,  y = 3']);
  assert.deepStrictEqual(answers('y = x^2; y = 2x + 3'), ['x = −1,  y = 1', 'x = 3,  y = 9']);
});

test('formulas and expressions in several letters', () => {
  assert.deepStrictEqual(answers('solve for y: 2x + 3y = 12'), ['y = −(2/3)x + 4']);
  assert.deepStrictEqual(answers('A = (1/2)bh for h'), ['h = 2A / b']);
  assert.deepStrictEqual(answers('v = u + at, solve for a'), ['a = (v − u) / t']);
  assert.deepStrictEqual(answers('solve for r: A = pi r^2'), ['r = ±√(A / π)']);
  assert.deepStrictEqual(answers('C = 2 pi r for r'), ['r = C / (2π)']);
  assert.deepStrictEqual(answers('solve for b: a^2 + b^2 = c^2'), ['b = ±√(c² − a²)']);
  assert.deepStrictEqual(answers('(a+b)^2'), ['a² + 2ab + b²']);
  assert.deepStrictEqual(answers('(x+y)(x-y)'), ['x² − y²']);
  assert.deepStrictEqual(answers('simplify (x+1)^2'), ['x² + 2x + 1']);
});

test('special cases', () => {
  assert.strictEqual(compute('x = x').kindLabel, 'Identity');
  assert.strictEqual(compute('x + 1 = x').kindLabel, 'No solution');
  assert.deepStrictEqual(answers('2+2=5'), ['False']);
  assert.deepStrictEqual(answers('(x + 1)^3'), ['x³ + 3x² + 3x + 1']);
});

test('word problems are detected, not mis-solved', () => {
  assert.ok(isWordProblem('Tom has 3 apples and buys 5 more. How many apples does he have?'));
  assert.ok(compute('A train travels 120 km in 2 hours. What is its speed?').isWord);
  assert.ok(!isWordProblem('solve for r: A = pi r^2'));
  assert.ok(!isWordProblem('sin(x) + cos(x) = 1'));
  assert.ok(!isWordProblem('x + y = 5 and x - y = 1'));
});

test('errors are reported, not thrown', () => {
  assert.strictEqual(compute('1/0').error, 'Division by zero is undefined.');
  assert.ok(compute('2x+').isError);
  assert.ok(compute('x < y').isError);
  assert.ok(compute('solve for q: 2x = 4').isError);
  assert.ok(compute('').isError);
});
