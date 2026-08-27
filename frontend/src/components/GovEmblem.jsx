import './GovEmblem.css'

// India's actual State Emblem (Lion Capital of Ashoka) — the user's own
// reference photo, background-removed, original color preserved. Not a
// depiction of any person.
export default function GovEmblem({ state = 'idle' }) {
  return (
    <div className={`gov-emblem gov-emblem-${state}`}>
      <div className="gov-emblem-ring gov-emblem-ring-outer" />
      <div className="gov-emblem-ring gov-emblem-ring-mid" />

      <div className="gov-emblem-stage">
        <img
          src="/images/ashoka-lion-capital.png"
          alt="Lion Capital of Ashoka"
          className="gov-emblem-image"
        />
      </div>

      <div className="gov-emblem-label">
        {state === 'listening' ? 'Listening…' : state === 'speaking' ? 'Speaking…' : 'ApexFi Assistant'}
      </div>
    </div>
  )
}
