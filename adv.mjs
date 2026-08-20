import { readFileSync } from 'node:fs';
const inst = new WebAssembly.Instance(new WebAssembly.Module(readFileSync('scorer.wasm')), {});
const { alloc, rank_answer, memory } = inst.exports;
const put=s=>{const b=Buffer.from(s,'utf8');const p=alloc(b.length||1);new Uint8Array(memory.buffer,p,b.length).set(b);return[p,b.length];};
const sc=(q,gt,ma)=>{const[a,b]=put(q),[c,d]=put(gt),[e,f]=put(ma);return rank_answer(a,b,c,d,e,f);};
// ADVERSARIAL: bad answers that are only SLIGHTLY wrong, plus format-variant good answers
const A=[
 ['price','$69,142.50','69142.5 USD','69,900.00 USD'],        // 1.1% off
 ['price','$69,142.50','$69.14k','$69,500'],                   // 0.5% off
 ['pe','31.4','31.40','32.9'],                                 // 4.8% off
 ['tvl','$11.2B','11.2 billion','11.9 billion'],               // 6.3% off
 ['supply','580,214,110','580.21 million','575,000,000'],      // 0.9% off
 ['funding','0.01%','0.010 percent','0.014%'],                 // 40% off but tiny abs
 ['cap','$47.58 billion','47,580,000,000','48.9 billion'],     // 2.8% off
 ['vol','18.4 million','18,400,000','18.9 million'],           // 2.7% off
];
let wins=0,sum=0;
console.log('ADVERSARIAL near-miss bads + format-variant goods');
for(const[q,gt,g,b]of A){const G=sc(q,gt,g),B=sc(q,gt,b);const w=G>B;if(w)wins++;sum+=G-B;
console.log(`  ${w?' ':'<'} good ${G.toFixed(4)}  bad ${B.toFixed(4)}  Δ${(G-B).toFixed(4)}   gt=${gt}  bad=${b}`);}
console.log(`\n  ordering ${wins}/${A.length}   margin ${(sum/A.length).toFixed(5)}`);
