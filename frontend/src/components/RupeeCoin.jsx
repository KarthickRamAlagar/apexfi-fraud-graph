import './RupeeCoin.css'

// Bare glyph, no coin disc — a large, bold ₹ that spins in 3D. Reads clean
// at any card height, unlike a disc which distorts to an oval when squeezed.
export default function RupeeCoin({ size = 56 }) {
  return (
    <div className="rupee-scene" style={{ width: size, height: size }}>
      <div className="rupee-spin" style={{ fontSize: size }}>
        <span className="rupee-face rupee-front">₹</span>
        <span className="rupee-face rupee-back">₹</span>
      </div>
    </div>
  )
}
