import './GovEmblem.css'

// ApexFi brand mark (placeholder logo -- drop your own transparent PNG at
// public/images/apexfi-logo.png to replace it). Component name kept so imports don't change.
export default function GovEmblem({ state = 'idle' }) {
  return (
    <div className={`gov-emblem gov-emblem-${state}`}>
      <div className="gov-emblem-ring gov-emblem-ring-outer" />
      <div className="gov-emblem-ring gov-emblem-ring-mid" />

      <div className="gov-emblem-stage">
        <img
          src="/images/apexfi-logo.png"
          alt="ApexFi logo"
          className="gov-emblem-image"
        />
      </div>

      <div className="gov-emblem-label">
        {state === 'listening' ? 'Listening…' : state === 'speaking' ? 'Speaking…' : 'ApexFi Assistant'}
      </div>
    </div>
  )
}
