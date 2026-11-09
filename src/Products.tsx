import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube, MagnifyingGlass, CaretLeft, CaretRight, ArrowClockwise, PlugsConnected, WarningCircle, TrendDown, ArrowUpRight, Pulse, ArrowLeft, X } from '@phosphor-icons/react';
import type { Product, Status } from './types';
import { dropeaMarkets } from './markets';
import { count, money } from './metrics';

export function exportProducts(products: Product[]) {
  const escape = (value: unknown) => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""') + '"';
  const rows = [['ID','Producto','Estado','Variante','SKU','Stock','Precio proveedor','Moneda'], ...products.flatMap(p => (p.variants?.length ? p.variants : [{}]).map(v => [p.product_id || p.id,p.name,p.status,'name' in v ? v.name : '', 'sku' in v ? v.sku : '', 'stock' in v ? v.stock : '', 'price' in v ? v.price : '', 'currency' in v ? v.currency : '']))];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download='catalogo-dropea.csv';a.click();URL.revokeObjectURL(url);
}

function stockOf(product: Product) {
  const known=(product.variants||[]).filter(v=>typeof v.stock==='number');
  return known.length?known.reduce((sum,v)=>sum+v.stock!,0):null;
}
function minPrice(product: Product) {
  const known=(product.variants||[]).filter(v=>typeof v.price==='number');
  return known.length?Math.min(...known.map(v=>v.price!)):null;
}
function ProductPicture({ product, index }: { product: Product; index: number }) {
  const [failed,setFailed] = useState(false);
  const raw = product.media?.images?.[0];
  const image = raw?.startsWith('https://') ? raw : null;
  return <div className={`catalog-visual mini-${index%4}`}>{image && !failed ? <img src={image} alt={product.name} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : <Cube size={55} weight="duotone"/>}<span>#{product.product_id || product.id}</span>{(product.stockRadar?.drop24h||0)>0 && <div className="stock-photo-badge"><TrendDown size={13}/><span>En movimiento</span></div>}</div>;
}
function StockLine({product}:{product:Product}) {
  const values=product.stockRadar?.history.map(point=>point.stock)||[];
  if(values.length<2)return <div className="stock-awaiting"><span/><span/><span/></div>;
  const low=Math.min(...values),high=Math.max(...values),range=Math.max(high-low,1);
  const points=values.map((v,i)=>`${2+i/(values.length-1)*86},${27-(v-low)/range*23}`).join(' ');
  return <svg className="stock-line" viewBox="0 0 90 32" role="img" aria-label="Historial observado de stock"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/><circle cx="88" cy={27-(values.at(-1)!-low)/range*23} r="2.5" fill="currentColor"/></svg>;
}
function StockRadar({products,onFind,syncing}:{products:Product[];onFind:(name:string)=>void;syncing:boolean}) {
  const moving=products.filter(p=>(p.stockRadar?.drop24h||0)>0).sort((a,b)=>b.stockRadar!.drop24h-a.stockRadar!.drop24h);
  const observed=products.filter(p=>p.stockRadar);
  const compared=observed.filter(p=>p.stockRadar?.compared);
  const drops=moving.reduce((sum,p)=>sum+p.stockRadar!.drop24h,0);
  return <section className="stock-radar" aria-label="Radar de stock"><div className="radar-heading"><div className="radar-title"><span className="radar-mark"><i/><i/><i/><b/></span><div><span className="radar-eyebrow">INTELIGENCIA DE CATÁLOGO</span><h2>Radar de stock <span>24 h</span></h2></div></div><span className="radar-live"><span/>{syncing?'Actualizando señales':'Lectura cada 30 min'}</span></div><div className="radar-overview"><p>Detecta los productos que están moviendo inventario.<span>Los que más bajan de stock aparecen primero.</span></p><div><span><strong>{count(moving.length)}</strong>con movimiento</span><span><strong>{count(drops)}</strong>unidades de baja</span><span><strong>{count(observed.length)}</strong>en observación</span></div></div>{moving.length ? <div className="radar-leaders">{moving.slice(0,4).map((p,i)=><button className="radar-leader" key={p.id} onClick={()=>onFind(p.name)}><span className="radar-rank">0{i+1}</span><div><strong>{p.name}</strong><span>Stock actual {count(p.stockRadar!.currentStock)} · {p.stockRadar!.observations} lecturas</span></div><StockLine product={p}/><span className="radar-decrease"><TrendDown size={14}/>−{count(p.stockRadar!.drop24h)}</span><ArrowUpRight size={14}/></button>)}</div> : <div className="radar-empty"><Pulse size={21}/><div><strong>{compared.length?'Sin caídas de stock detectadas en las últimas 24 horas':observed.length?'Primera lectura guardada. Buscando movimiento.':'Preparando la primera lectura de stock.'}</strong><span>{compared.length?'El radar seguirá comparando el inventario en las próximas lecturas.':'Las señales aparecerán al comparar dos lecturas reales. También puedes pulsar Sincronizar.'}</span></div></div>}<div className="radar-foot"><span/>Las bajas de stock son señales de movimiento, no ventas confirmadas; también pueden ser ajustes del proveedor.</div></section>;
}

export default function Products({ products, status, demo, busy, onSync, onConnect }: { products: Product[]; status: Status; demo: boolean; busy: boolean; onSync:()=>void; onConnect:()=>void }) {
  const [query,setQuery]=useState('');const [page,setPage]=useState(1);const [sort,setSort]=useState('movement');
  const clearSearch=()=>{setQuery('');setPage(1);};
  const country=dropeaMarkets.find(c=>c.code===status.market);
  const filtered=useMemo(()=>products.filter(p=>`${p.name} ${p.id} ${(p.variants||[]).map(v=>v.sku||'').join(' ')}`.toLowerCase().includes(query.toLowerCase())),[products,query]);
  const ordered=useMemo(()=>[...filtered].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='stock'?(stockOf(a)??Infinity)-(stockOf(b)??Infinity):sort==='price'?(minPrice(a)??Infinity)-(minPrice(b)??Infinity):(b.stockRadar?.drop24h||0)-(a.stockRadar?.drop24h||0)),[filtered,sort]);
  const lastMarket=useRef(status.market),lastFilters=useRef({query,sort});
  useEffect(()=>{if(lastMarket.current!==status.market){setPage(1);setQuery('');lastMarket.current=status.market;}},[status.market]);
  useEffect(()=>{if(lastFilters.current.query!==query||lastFilters.current.sort!==sort)setPage(1);lastFilters.current={query,sort};},[query,sort]);
  const pages=Math.max(1,Math.ceil(filtered.length/24));const current=Math.min(page,pages);
  const syncing=busy || Boolean(status.productSync);
  return <><StockRadar products={demo?[]:products} onFind={setQuery} syncing={syncing}/><section className="panel products-panel"><div className="panel-title"><h2>Catálogo de Dropea · {country?.name}</h2><span className="subtle-tag">{count(products.length)} productos</span></div><div className="product-sync-status">{demo ? 'Datos de demostración' : syncing ? `Importando catálogo de ${country?.name}…${status.productSync?.total ? ` ${count(status.productSync.loaded)} de ${count(status.productSync.total)} productos` : ' Consultando Dropea.'}` : status.productsLastSync ? `Catálogo actualizado ${new Date(status.productsLastSync).toLocaleString('es-CL',{timeZone:'America/Santiago'})} · Hora de Chile` : status.configured ? 'Catálogo pendiente de importar desde Dropea.' : 'Este país todavía no tiene una API Key conectada.'}</div>
  {(products.length>0 || query) && <div className="table-toolbar">{query && <button className="button catalog-return" onClick={clearSearch}><ArrowLeft size={16}/>Volver a todos los productos</button>}<label className="search-input"><MagnifyingGlass size={17}/><input aria-label="Buscar productos" placeholder="Buscar por nombre, ID o SKU…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')clearSearch();}}/>{query && <button type="button" className="icon-button catalog-clear" aria-label="Limpiar búsqueda de productos" onClick={clearSearch}><X size={16}/></button>}</label><select aria-label="Ordenar catálogo" value={sort} onChange={e=>setSort(e.target.value)}><option value="movement">Mayor caída de stock</option><option value="stock">Menor stock disponible</option><option value="price">Menor precio proveedor</option><option value="name">Nombre A–Z</option></select><span className="muted small">{count(filtered.length)} resultados</span></div>}
  {!demo && status.productsError && <div className="error-inline" role="alert"><WarningCircle size={17}/><span>{status.productsError}</span></div>}
  {syncing && !products.length ? <div className="catalog-loading" aria-label="Cargando catálogo"><div/><div/><div/><div/><p>Estamos importando las páginas del catálogo. En países con miles de productos puede tardar alrededor de un minuto.</p></div> : filtered.length ? <div className="catalog-grid">{ordered.slice((current-1)*24,current*24).map((p,i)=>{
    const stock=stockOf(p),price=minPrice(p),drop=p.stockRadar?.drop24h||0;
    return <article key={p.id||p.product_id} className={`catalog-item ${drop?'catalog-moving':''}`}><ProductPicture product={p} index={i}/><div className="catalog-details"><div className="catalog-topline"><span className="catalog-status"><i/>{p.status==='PUBLIC'?'Catálogo público':p.status==='EXCLUSIVE'?'Exclusivo':p.status}</span><span>{p.variants?.length||0} variantes</span></div><h3 title={p.name}>{p.name}</h3><div className="catalog-price-row"><div><span>PRECIO PROVEEDOR DESDE</span><strong className="product-price">{price!==null?money(price,p.variants?.find(v=>v.currency)?.currency||country?.currency||'EUR'):'No informado'}</strong></div><span className="catalog-country">{country?.code}</span></div><div className="catalog-stock-row"><div><span className="stock-available-dot"/><span>Stock: {stock!==null?count(stock):'No informado por Dropea'}</span></div><span className={drop?'stock-decreasing':'stock-tracking'}>{drop?<><TrendDown size={13}/>−{count(drop)} en 24 h</>:p.stockRadar?.compared?'Sin bajas detectadas':'En observación'}</span></div></div></article>;
  })}</div> : <div className="empty"><Cube size={32}/><strong>{query ? 'No hay coincidencias' : !status.configured && !demo ? 'Conecta Dropea para este país' : status.productsError ? 'No se pudo importar el catálogo' : status.productsLastSync ? `Dropea devolvió 0 productos para ${country?.name}` : 'Tu catálogo está pendiente de importar'}</strong><p>{query ? 'Prueba otro nombre, ID o SKU.' : status.productsLastSync && !status.productsError ? 'La API respondió correctamente, pero no devolvió productos visibles para esta cuenta en este mercado.' : status.productsError ? 'Revisa el error y vuelve a intentar. No es necesario cerrar sesión.' : 'La importación del catálogo es independiente de los pedidos y del filtro de fechas.'}</p>{!query && <button className="button primary" disabled={syncing} onClick={status.configured||demo?onSync:onConnect}>{status.configured||demo?<ArrowClockwise size={16}/>:<PlugsConnected size={16}/>} {status.configured||demo?'Actualizar catálogo':'Conectar cuenta'}</button>}</div>}
  {filtered.length>0 && <div className="pagination"><span>{count((current-1)*24+1)}–{count(Math.min(current*24,filtered.length))} de {count(filtered.length)}</span><div><button className="icon-button" disabled={current===1} aria-label="Productos anteriores" onClick={()=>setPage(current-1)}><CaretLeft/></button><span>Página {current} de {count(pages)}</span><button className="icon-button" disabled={current>=pages} aria-label="Productos siguientes" onClick={()=>setPage(current+1)}><CaretRight/></button></div></div>}
  </section></>;
}
