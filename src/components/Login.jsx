import { supabase } from '../supabase.js'

export default function Login() {
  const entrar = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
  return (
    <div className="empty-state">
      <div className="es-card">
        <div className="es-icon">📐</div>
        <h2>Prancheta</h2>
        <p>Memoriais descritivos de loteamento — seus projetos ficam salvos na nuvem, acessíveis de qualquer computador.</p>
        <button className="btn primary lg" onClick={entrar}>Entrar com Google @young</button>
      </div>
    </div>
  )
}
