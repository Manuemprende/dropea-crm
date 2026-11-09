import { memo, useMemo } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo';
import { feature } from 'topojson-client';
// Bundled locally: the visualization does not send customer locations to a map provider.
import world from 'world-atlas/countries-110m.json';
import { dropeaMarkets } from './markets';

const centers: Record<string, [number, number]> = { CL: [-70.67, -33.45], ES: [-3.7, 40.42], IT: [12.5, 41.9], PT: [-9.14, 38.72], MX: [-99.13, 19.43] };
export default memo(function Globe({ active, market = 'CL' }: { active: boolean; market?: string }) {
  const country = market==='ALL'?{name:'Todos los países',code:'GLOBAL'}:dropeaMarkets.find(c => c.code === market) || dropeaMarkets[3];
  const center: [number,number] = market==='ALL'?[-35,10]:centers[market] || centers.CL;
  const shapes = useMemo(() => {
    const cities: [number,number][] = market==='ALL'?Object.values(centers):[center, [center[0] + 1.2, center[1] + 1], [center[0] - 1.5, center[1] - 2]];
    const projection = geoOrthographic().rotate([-center[0], -center[1]]).translate([230, 185]).scale(154);
    const path = geoPath(projection);
    const land = feature(world as never, world.objects.countries as never);
    const routes = [[-99.13, 19.43], [-74.0, 40.71], [-46.63, -23.55], [-58.38, -34.60], [-3.7, 40.42]].map(p => {
      const interpolate = geoInterpolate(cities[0], p as [number, number]);
      return path({ type: 'LineString', coordinates: Array.from({ length: 50 }, (_, i) => interpolate(i / 49)) });
    });
    return { land: path(land), grid: path(geoGraticule10()), routes, points: cities.map(p => projection(p)!) };
  }, [market]);
  return <div className="globe-wrap"><svg className="globe" viewBox="0 0 460 365" aria-label={`Visualización ilustrativa de cobertura en ${country.name}`} role="img"><defs><radialGradient id="ocean" cx="32%" cy="25%"><stop stopColor="#224258"/><stop offset=".65" stopColor="#102a40"/><stop offset="1" stopColor="#091725"/></radialGradient><radialGradient id="atmosphere"><stop offset=".85" stopColor="#58b6ff" stopOpacity="0"/><stop offset="1" stopColor="#58b6ff" stopOpacity=".08"/></radialGradient><clipPath id="sphere"><circle cx="230" cy="185" r="154"/></clipPath></defs><circle cx="230" cy="185" r="171" fill="url(#atmosphere)"/><circle cx="230" cy="185" r="154" fill="url(#ocean)" stroke="#34576b"/><g clipPath="url(#sphere)"><path d={shapes.grid || ''} fill="none" stroke="#4e8199" strokeOpacity=".15" strokeWidth=".65"/><path d={shapes.land || ''} fill="#2f4f58" stroke="#54737a" strokeWidth=".55"/>{shapes.routes.map((d, i) => <path key={i} d={d || ''} fill="none" stroke={i % 2 ? '#78a9d9' : '#59bfff'} strokeWidth="1" opacity=".4"/>)}{shapes.points.map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r={i ? 2 : 5} fill="#87d8ff"/>{i === 0 && <circle className={active ? 'map-pulse' : ''} cx={x} cy={y} r="11" fill="none" stroke="#87d8ff" strokeOpacity=".45"/>}</g>)}</g><path d="M182 292 H90 L77 305" fill="none" stroke="#4c6b7c" strokeWidth=".7"/><text x="45" y="321" fill="#95a6ba" fontSize="10" fontFamily="inherit">{country.name.toUpperCase()} · {country.code}</text><text x="283" y="77" fill="#72909f" fontSize="9" letterSpacing="2">{Math.abs(center[1]).toFixed(2)}° {center[1] < 0 ? 'S' : 'N'}</text></svg><div className="globe-caption"><span className="dot"/> Tu comercio, conectado<span>{country.name} · Visualización de cobertura</span></div></div>;
});
