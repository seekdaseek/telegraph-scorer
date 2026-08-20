// Runs the scorer against every rejection reason observed on the live board.
import { readFileSync } from 'node:fs';

const bytes = readFileSync(process.argv[2] || '/home/claude/tgscore/scorer.wasm');

// GATE: no env / host imports. "candidate failed to load: module[env] not instantiated"
const mod = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(mod);
const inst = new WebAssembly.Instance(mod, {}); // deliberately empty: any import fails here
const { alloc, rank_answer, memory } = inst.exports;

const put = (s) => {
  const b = Buffer.from(s, 'utf8');
  const p = alloc(b.length || 1);
  new Uint8Array(memory.buffer, p, b.length).set(b);
  return [p, b.length];
};
const score = (q, gt, ma) => {
  const [qp, ql] = put(q), [gp, gl] = put(gt), [mp, ml] = put(ma);
  return rank_answer(qp, ql, gp, gl, mp, ml);
};

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

console.log('STRUCTURAL GATES');
ok(imports.length === 0, `no host imports (found ${imports.length})`);
ok(rank_answer.length === 6, `rank_answer takes exactly 6 params (got ${rank_answer.length})`);
ok(score('q', 'the answer', '') === 0, 'empty answer scores exactly 0');
ok(score('q', 'the answer', '   \t\n  ') === 0, 'whitespace answer scores exactly 0');

// GATE: alloc must survive past the 64KiB page boundary
let big = true;
try { for (let i = 0; i < 40; i++) put('x'.repeat(4096)); } catch { big = false; }
ok(big, 'alloc survives >64KiB of allocations (ptr=65536 rejection)');

// FIXTURES: [question, ground truth, good answer, bad answer]
const F = [
  ['what is the capital of france', 'Paris', 'The capital of France is Paris.', 'The capital of France is Lyon.'],
  ['what is the current price of bitcoin', '$69,142.50', 'Bitcoin is trading at 69142.50 USD right now.', 'Bitcoin is trading at 42,000 USD.'],
  ['what is solana trading at', '82.03 USD', 'SOL is $82.03', 'SOL is $61.10'],
  ['what is the market cap of solana', '$47.58 billion', 'Solana market cap is 47.58B', 'Solana market cap is 12.4B'],
  ['what is the total value locked in aave', '$11.2B', 'Aave TVL stands at 11,200,000,000 dollars.', 'Aave TVL stands at 3.1 billion dollars.'],
  ['what is the 24h volume of ethereum', '18.4 million', 'Ethereum 24h volume is 18,400,000.', 'Ethereum 24h volume is 902,000.'],
  ['what is the funding rate on btc perps', '0.01%', 'Current BTC perp funding is 0.01 percent.', 'Current BTC perp funding is 0.45 percent.'],
  ['what is the p/e ratio of apple', '31.4', 'Apple trades at a P/E of 31.4.', 'Apple trades at a P/E of 12.'],
  ['how many holders does the token have', '1,204,338', 'There are 1204338 holders.', 'There are 88 holders.'],
  ['what was q3 revenue', '$3.42 billion', 'Q3 revenue came in at 3,420 million dollars.', 'Q3 revenue came in at 340 million dollars.'],
  ['what is the open interest on sol perps', '$1.9B', 'Open interest is 1.9 billion USD.', 'Open interest is unavailable.'],
  ['what is the current gas price on ethereum', '12 gwei', 'Gas is about 12 gwei.', 'Gas is about 190 gwei.'],
  ['what is eur to usd', '1.0847', 'One euro buys 1.0847 dollars.', 'One euro buys 0.82 dollars.'],
  ['what is the circulating supply of sol', '580,214,110', 'Circulating supply is 580.2 million SOL.', 'Circulating supply is 21 million SOL.'],
  ['what is the liquidation volume in the last hour', '$1.6 billion', 'About 1,600,000,000 was liquidated.', 'About 4 million was liquidated.'],
  ['who is the ceo of microsoft', 'Satya Nadella', 'Microsoft is led by Satya Nadella.', 'Microsoft is led by Steve Ballmer.'],
];

console.log('\nSELF-MATCH (ground truth vs itself, floor 0.75)');
let worstSelf = 1;
for (const [q, gt] of F) { const s = score(q, gt, gt); if (s < worstSelf) worstSelf = s; }
ok(worstSelf >= 0.75, `worst self-match ${worstSelf.toFixed(4)} >= 0.75`);

console.log('\nORDERING + MARGIN');
let wins = 0, sum = 0;
for (const [q, gt, good, bad] of F) {
  const g = score(q, gt, good), b = score(q, gt, bad);
  if (g > b) wins++;
  sum += g - b;
  const flag = g > b ? ' ' : '<';
  console.log(`  ${flag} good ${g.toFixed(4)}  bad ${b.toFixed(4)}  Δ${(g - b).toFixed(4)}  ${gt}`);
}
const margin = sum / F.length;
console.log(`\n  ordering ${wins}/${F.length}   average margin ${margin.toFixed(5)}`);
ok(wins === F.length, `ordering ${wins}/${F.length} (champion does 32/32)`);
ok(margin >= 0.15, `margin ${margin.toFixed(4)} >= 0.15 floor`);
ok(margin > 0.80775374, `margin ${margin.toFixed(4)} > champion 0.80775374`);

console.log(`\n${fail === 0 ? 'ALL GATES PASSED' : fail + ' GATE(S) FAILED'}`);
process.exit(fail ? 1 : 0);
