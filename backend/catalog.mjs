export const catalog = [
  {id:1,name:'Sony WH-1000XM5',price:4748100,asset:'headphones'},
  {id:2,name:'Apple iPhone 15',price:10449810,asset:'phone'},
  {id:3,name:'Nike Air Max 270',price:1899050,asset:'shoe'},
  {id:4,name:'JBL Flip 6',price:2089810,asset:'speaker'},
  {id:5,name:'Galaxy Watch6',price:3419810,asset:'watch'},
  {id:6,name:'Amul Taaza Milk',price:12920,asset:'milk'}
];
export function quote(items) {
  if(!Array.isArray(items)||!items.length||items.length>6)throw new Error('Keranjang harus berisi 1–6 jenis produk.');
  const seen=new Set();
  const lines=items.map(item=>{
    const p=catalog.find(p=>p.id===item.id);
    if(!p||seen.has(p.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>5)throw new Error('Produk atau jumlah tidak valid (maksimal 5 per produk).');
    seen.add(p.id);
    return {id:p.id,name:p.name,price:p.price,quantity:item.quantity,asset:p.asset};
  });
  const subtotal=lines.reduce((sum,p)=>sum+p.price*p.quantity,0);
  const shipping=15000;
  return {items:lines,subtotal,shipping,total:subtotal+shipping,currency:'IDR',environment:'sandbox'};
}
