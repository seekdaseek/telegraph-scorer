// FORMAT NEUTRALITY GATE.
// The public fairness claim is that the module is content-blind by construction:
// it sees three strings and never miner identity. That has to stay LITERALLY
// true, not merely technically true. If the same correct value scores higher
// when written in AgentFeed's own one-sentence shape than as a bare number or as
// a competitor's JSON, the scorer favours his own output format and must not go
// on chain.
import { Scorer } from './runner.mjs';
export const CASES = [
  { q:'what is the current price of eth in usd', gt:'$2,390.30', v:'2390.30', forms:{
      bare:            '2390.30',
      sentence:        'The current price of ETH is 2390.30 USD.',
      json_coingecko:  '{"ethereum":{"usd":2390.3}}',
      json_multifield: '{"symbol":"ETH","price":2390.30,"currency":"USD","source":"coinbase","ts":1787000000}',
      csv:             'ETH,2390.30,USD',
      markdown:        '| ETH | 2390.30 | USD |',
      prose_long:      'Ethereum is currently changing hands at two thousand three hundred and ninety dollars and thirty cents, or 2390.30 USD.',
  }},
  { q:'what is the price of btc', gt:'$77,456.99', v:'77456.99', forms:{
      bare:            '77456.99',
      sentence:        'The current price of BTC is 77456.99 USD.',
      json_coingecko:  '{"bitcoin":{"usd":77456.99}}',
      json_multifield: '{"symbol":"BTC","price":77456.99,"currency":"USD","venue":"kraken"}',
      csv:             'BTC,77456.99,USD',
      markdown:        '| BTC | 77456.99 | USD |',
      prose_long:      'Bitcoin trades at 77456.99 dollars right now according to the aggregate feed.',
  }},
  { q:'what is sol trading at', gt:'103.745', v:'103.745', forms:{
      bare:            '103.745',
      sentence:        'The current price of SOL is 103.745 USD.',
      json_coingecko:  '{"solana":{"usd":103.745}}',
      json_multifield: '{"symbol":"SOL","price":103.745,"currency":"USD"}',
      csv:             'SOL,103.745,USD',
      markdown:        '| SOL | 103.745 | USD |',
      prose_long:      'Solana is at 103.745 US dollars per token at the moment.',
  }},
];
export function check(path, tol=0.10){
  const s=new Scorer(path); const rows=[]; let worstSpread=0; let sentenceBiasMax=-1;
  for (const c of CASES){
    const scores={};
    for (const [name,ans] of Object.entries(c.forms)) scores[name]=s.score(c.q,c.gt,ans);
    const vals=Object.values(scores);
    const spread=Math.max(...vals)-Math.min(...vals);
    worstSpread=Math.max(worstSpread,spread);
    const others=Object.entries(scores).filter(([k])=>k!=='sentence').map(([,v])=>v);
    const bias=scores.sentence-Math.max(...others);
    sentenceBiasMax=Math.max(sentenceBiasMax,bias);
    rows.push({gt:c.gt,scores,spread,bias});
  }
  return {rows,worstSpread,sentenceBiasMax,pass:worstSpread<=tol&&sentenceBiasMax<=tol};
}
