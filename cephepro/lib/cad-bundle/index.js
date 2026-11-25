import p0 from './part0.js';
import p1 from './part1.js';
import p2 from './part2.js';
import p3 from './part3.js';
import p4 from './part4.js';
import p5 from './part5.js';
export const runtimeArchive=()=>Buffer.from([p0,p1,p2,p3,p4,p5].join(''),'base64');
