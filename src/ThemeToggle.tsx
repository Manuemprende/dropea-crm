import {useEffect,useState} from 'react';
import {Sun,Moon} from '@phosphor-icons/react';
export default function ThemeToggle(){
  const [theme,setTheme]=useState(()=>localStorage.getItem('dropea-theme')==='light'?'light':'dark');
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('dropea-theme',theme);},[theme]);
  const light=theme==='light';
  return <button className="theme-toggle" aria-label={light?'Activar modo noche':'Activar modo día'} aria-pressed={light} onClick={()=>setTheme(light?'dark':'light')}><span>{light?<Sun size={18} weight="duotone"/>:<Moon size={18} weight="duotone"/>}<span>Modo {light?'día':'noche'}</span></span><span className="theme-toggle-switch"><i/></span></button>;
}
