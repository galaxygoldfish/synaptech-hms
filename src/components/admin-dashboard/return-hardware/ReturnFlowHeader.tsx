import { ArrowLeftIcon, UserIcon } from './icons'

interface ReturnFlowHeaderProps {
  userName: string
  onBack: () => void
}

export function ReturnFlowHeader({ userName, onBack }: ReturnFlowHeaderProps) {
  return (
    <>
      <div className="app-header">
        <div className="app-header__brand">
          <h1>
            <span className="app-header__brand-strong">Synaptech</span>{' '}
            <span className="app-header__brand-muted">Hardware Management</span>
          </h1>
        </div>
        <div className="app-header__actions">
          <span className="pill-button" aria-hidden="true">
            <UserIcon size={18} />
            <span>{userName}</span>
          </span>
        </div>
      </div>

      <button type="button" className="pill-button return-flow__back" onClick={onBack}>
        <ArrowLeftIcon size={18} />
        <span>Back</span>
      </button>
    </>
  )
}
