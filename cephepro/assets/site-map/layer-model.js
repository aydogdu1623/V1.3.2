// Local supervised text classifier: IDF weighted character trigrams and nearest labelled exemplar.
// No coordinates, layer names, or files leave this worker. Scores are similarity, not probabilities.
const examples = {
 building:'building footprint|villa|dwelling|apartment|housing|residential block|house|masonry wall|facade|bina|konut|yapı|blok|duvar|cephe|bâtiment|maison|immeuble|gebäude|wohnhaus|здание|корпус|مبنى|فيلا',
 road:'road|driveway|street|access lane|pavement|carriageway|yol|kaldırım|otopark|ulaşım|route|voirie|chaussée|straße|fahrbahn|дорога|проезд|طريق',
 landscape:'landscape|planting|vegetation|garden|grass|tree|bahçe|peyzaj|ağaç|yeşil alan|jardin|pelouse|garten|grünfläche|сад|озеленение|حديقة',
 water:'water|swimming pool|pond|lake|sea|havuz|gölet|deniz|su|piscine|bassin|wasser|becken|вода|бассейн|مسبح|مياه',
 boundary:'boundary|plot limit|parcel|property line|perimeter|parsel|arsa sınırı|çevre sınırı|limite|parcelle|grundstück|grenze|граница|участок|حدود',
 omit:'annotation|dimension|text|hatching|grid axis|title block|dimensions|ölçülendirme|tarama|yazılar|eksenler|lejant|ölçü|cotations|hachures|beschriftung|bemaßung|размеры|штриховка|أبعاد|تهشير'
};
const tokens = s=>String(s).toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/ß/g,'ss').split(/[^\p{L}]+/u).filter(x=>x.length>=2);
function grams(words){const set=new Set();for(const word of words){const s='^'+word+'$';set.add('='+word);for(let i=0;i<s.length-2;i++)set.add(s.slice(i,i+3));}return set;}
const corpus=Object.entries(examples).flatMap(([kind,s])=>s.split('|').map(name=>({kind,g:grams(tokens(name))})));
const df=new Map();for(const {g} of corpus)for(const x of g)df.set(x,(df.get(x)||0)+1);
const weight=x=>(1+Math.log((corpus.length+1)/(1+(df.get(x)||0))))**2;
const norm=g=>Math.sqrt([...g].reduce((s,x)=>s+weight(x),0));
for(const ex of corpus)ex.norm=norm(ex.g);
const cache=new Map();
export function predictLayer(name){
 if(cache.has(name))return cache.get(name);
 const words=tokens(String(name).slice(0,160)),scores=new Map();
 for(const input of [words,...words.map(w=>[w])]){const q=grams(input),n=norm(q);if(!n)continue;
  for(const ex of corpus){let dot=0;for(const x of q)if(ex.g.has(x))dot+=weight(x);
   scores.set(ex.kind,Math.max(scores.get(ex.kind)||0,dot/(ex.norm*n)));}}
 const sorted=[...scores].sort((a,b)=>b[1]-a[1]);let hit=null;
 if(sorted[0]?.[1]>=.54 && sorted[0][1]-(sorted[1]?.[1]||0)>=.12)hit={kind:sorted[0][0],confidence:Math.min(.98,sorted[0][1])};
 if(cache.size<4096)cache.set(name,hit);return hit;
}
