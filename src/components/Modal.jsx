import { useEffect } from 'react'

export default function Modal({ title, onClose, actions, children, wide }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="modal-actions">{actions}<button className="btn" onClick={onClose}>Fechar</button></div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
