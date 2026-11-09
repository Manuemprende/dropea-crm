import { CheckCircle, GlobeHemisphereWest } from '@phosphor-icons/react';
import { dropeaMarkets } from './markets';

export function Flag({ code }: { code: string }) {
  return <img className="country-flag" src={`/flags/${code.toLowerCase()}.svg`} alt="" aria-hidden="true" width="32" height="24"/>;
}

export default function CountryPicker({ market, onChange, disabled = false, configured = [], allowAll=false }: { market: string; onChange: (code: string) => void; disabled?: boolean; configured?: string[];allowAll?:boolean }) {
  return <div className="country-selector" role="group" aria-label="País seleccionado"><div className="country-selector-label">TU OPERACIÓN POR PAÍS<span>Conexiones y datos independientes</span></div><div className={`country-tabs ${allowAll?'has-global':''}`}>{allowAll&&<button type="button" disabled={disabled} aria-pressed={market==='ALL'} className={`country-tab ${market==='ALL'?'country-tab-selected':''}`} onClick={()=>onChange('ALL')}><GlobeHemisphereWest className="global-picker-icon" size={30} weight="duotone"/><span>Todos<small>Vista global</small></span>{market==='ALL'&&<CheckCircle size={16} weight="fill"/>}</button>}{dropeaMarkets.map(c => <button key={c.code} type="button" disabled={disabled} aria-pressed={market === c.code} onClick={() => onChange(c.code)} className={`country-tab ${market === c.code ? 'country-tab-selected' : ''} ${configured.includes(c.code) ? 'country-tab-connected' : ''}`} title={configured.includes(c.code) ? 'API Key guardada para este país' : 'Sin API Key guardada'}><Flag code={c.code}/><span>{c.name}<small>{configured.includes(c.code) ? <><span className="key-saved-dot"/>Key agregada</> : 'Sin API Key'}</small></span>{market === c.code && <CheckCircle size={16} weight="fill"/>}</button>)}</div></div>;
}
