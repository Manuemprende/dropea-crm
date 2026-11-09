import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeSlash, LockKey, User, ShieldCheck, WarningCircle } from '@phosphor-icons/react';

type Session = { enabled: boolean; authenticated: boolean; username: string | null };

const getCachedSession = (): Session | null => {
  try {
    const raw = localStorage.getItem('crm-session-cache');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

export default function AuthGate({ children }: { children: (logout?: () => void) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(getCachedSession);
  const [connectionError, setConnectionError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkSession = async () => {
    setConnectionError('');
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) throw new Error('No pudimos conectar con el servidor.');
      const data: Session = await response.json();
      setSession(data);
      if (data.authenticated) {
        try { localStorage.setItem('crm-session-cache', JSON.stringify(data)); } catch {}
      } else {
        localStorage.removeItem('crm-session-cache');
      }
    } catch {
      if (!session) {
        setConnectionError('No pudimos conectar con el servidor. Inténtalo de nuevo.');
      }
    }
  };
  useEffect(() => {
    checkSession();
    const expired = () => {
      try { localStorage.removeItem('crm-session-cache'); } catch {}
      setSession(s => s ? { ...s, authenticated: false } : s);
      setPassword('');
      setError('Tu sesión terminó. Ingresa nuevamente.');
    };
    window.addEventListener('crm-session-expired', expired);
    return () => window.removeEventListener('crm-session-expired', expired);
  }, []);
  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión.');
      try { localStorage.removeItem('crm-session-cache'); } catch {}
      setPassword(''); setError(''); setSession(s => s ? { ...s, authenticated: false } : s);
    } catch { window.alert('No se pudo cerrar la sesión. Inténtalo nuevamente.'); }
  };
  if (!session) return <div className="auth-loading"><img src="/crm-dropea-logo.png" alt="CRM Dropea" width="240" height="160" style={{ maxWidth: '240px', height: 'auto', display: 'block' }} /><p role="status">{connectionError || 'Preparando tu centro de operaciones…'}</p>{connectionError && <button className="button primary" onClick={checkSession}>Reintentar</button>}</div>;
  if (session.authenticated) return <>{children(session.enabled ? logout : undefined)}</>;
  return <div className="login-page"><section className="login-brand" aria-label="CRM Dropea"><div className="login-brand-main"><div className="login-logo-stage"><div className="login-orbit orbit-one"/><div className="login-orbit orbit-two"/><img src="/crm-dropea-logo.png" alt="CRM Dropea · Comercio y crecimiento" width="1536" height="1024"/></div></div></section><section className="login-form-side"><div className="login-top-note"><span className="dot"/> TU WORKSPACE, SIEMPRE CONECTADO</div><div className="login-form-container"><span className="login-lock"><LockKey size={26} weight="duotone"/></span><span className="login-eyebrow">ACCESO A TU PLATAFORMA</span><h2>Bienvenido de nuevo.</h2><p className="login-description">Ingresa tus datos y toma el control de tu operación.</p><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, remember }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
      const newSession = { enabled: true, authenticated: true, username: data.username };
      setPassword(''); setSession(newSession);
      try { localStorage.setItem('crm-session-cache', JSON.stringify(newSession)); } catch {}
    } catch (err) { setError((err as Error).message || 'Revisa tu conexión e intenta nuevamente.'); }
    finally { setBusy(false); }
  }}><label className="login-field">Usuario<div className="login-input"><User size={19}/><input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="Tu nombre de usuario" value={username} onChange={e => setUsername(e.target.value)}/></div></label><label className="login-field">Contraseña<div className="login-input"><LockKey size={19}/><input name="password" autoComplete="current-password" required type={visible ? 'text' : 'password'} placeholder="Ingresa tu contraseña" value={password} onChange={e => setPassword(e.target.value)}/><button type="button" className="icon-button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeSlash size={19}/> : <Eye size={19}/>}</button></div></label><label className="remember-session"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/>Mantener mi sesión por 7 días</label>{error && <div className="login-error" role="alert"><WarningCircle size={18}/><span>{error}</span></div>}<button className="button primary login-submit" disabled={busy} type="submit"><span>{busy ? 'Ingresando…' : 'Iniciar sesión'}</span>{!busy && <ArrowRight size={20} weight="bold"/>}</button></form><div className="login-private"><ShieldCheck size={16}/><span>Acceso privado a tu centro de operaciones.</span></div></div><footer className="login-form-footer"><span>Dropea CRM - By Wentix AI</span><span>🛡️ Seguridad SSL · © 2026</span></footer></section></div>;
}
