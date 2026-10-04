// const IMAGE_SRC = '/l2.png'

// export default function LoadingOverlay({ children }) {
//   return (
//     <div className="relative">
//       {children}

//       <style>{`
//         @keyframes loadingOverlayFloat {
//           0%, 100% {
//             transform: translateY(0) scale(1);
//           }
//           50% {
//             transform: translateY(-8px) scale(1.025);
//           }
//         }

//         @keyframes loadingOverlayGlow {
//           0%, 100% {
//             opacity: 0.45;
//             transform: scale(0.92);
//           }
//           50% {
//             opacity: 0.8;
//             transform: scale(1.08);
//           }
//         }

//         @keyframes loadingOverlayLight {
//           0%, 100% {
//             opacity: 0.15;
//           }
//           50% {
//             opacity: 0.35;
//           }
//         }
//       `}</style>

//       {/* Desktop / tablet loading overlay */}
//       <div className="absolute inset-0 items-center justify-center hidden overflow-hidden pointer-events-none md:flex">

//         {/* Large ambient glow */}
//         <div
//           className="absolute rounded-full"
//           style={{
//             width: 'clamp(360px, 55vw, 760px)',
//             height: 'clamp(360px, 55vw, 760px)',
//             background:
//               'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--risk-high)), hsl(var(--risk-low)), hsl(var(--primary)))',
//             filter: 'blur(100px)',
//             opacity: 0.5,
//             animation: 'loadingOverlayGlow 2.4s ease-in-out infinite',
//           }}
//         />

//         {/* Secondary soft light */}
//         <div
//           className="absolute rounded-full"
//           style={{
//             width: 'clamp(280px, 42vw, 600px)',
//             height: 'clamp(280px, 42vw, 600px)',
//             background:
//               'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 68%)',
//             filter: 'blur(35px)',
//             animation: 'loadingOverlayLight 2.2s ease-in-out infinite',
//           }}
//         />

//         {/* Large centered character/image */}
//         <div
//           className="relative flex items-start justify-center"
//           style={{
//             width: 'clamp(360px, 48vw, 680px)',
//             height: 'clamp(480px, 72vh, 820px)',
//             animation: 'loadingOverlayFloat 2.4s ease-in-out infinite',
//           }}
//         >
//           <img
//             src={IMAGE_SRC}
//             alt="Loading"
//             draggable="false"
//             style={{
//               width: '100%',
//               height: '100%',
//               objectFit: 'contain',
//               objectPosition: 'center top',

//               /*
//                * Removes the hard rectangular/square appearance
//                * by softly fading the outer edges into the background.
//                */
//               WebkitMaskImage:
//                 'radial-gradient(ellipse 58% 72% at 50% 42%, black 45%, rgba(0,0,0,0.96) 62%, rgba(0,0,0,0.55) 78%, transparent 100%)',
//               maskImage:
//                 'radial-gradient(ellipse 58% 72% at 50% 42%, black 45%, rgba(0,0,0,0.96) 62%, rgba(0,0,0,0.55) 78%, transparent 100%)',

//               filter:
//                 'drop-shadow(0 25px 45px rgba(0,0,0,0.55)) drop-shadow(0 0 35px rgba(255,255,255,0.08))',
//             }}
//           />
//         </div>
//       </div>
//     </div>
//   )
// }

/**
 * Wraps any existing skeleton component, layering a large, centered,
 * animated image on top of it, with a soft colorful glow behind it --
 * no background box or border. Hidden on small/mobile screens (the
 * overlay simply doesn't render there; the plain skeleton still shows
 * underneath) -- this app's DesktopOnlyGate already blocks the app
 * broadly on real mobile devices, this is an extra, local safeguard
 * specifically for this visual effect.
 *
 * Usage (in any page, wherever a skeleton is currently rendered):
 *
 *   if (!data) return (
 *     <LoadingOverlay>
 *       <DashboardSkeleton />
 *     </LoadingOverlay>
 *   )
 *
 * Place your real image file at: frontend/public/loading-overlay.png
 */
/**
 * Wraps any existing skeleton component, layering a large, centered,
 * animated image on top of it, with a soft colorful glow behind it --
 * no background box or border. Hidden on small/mobile screens (the
 * overlay simply doesn't render there; the plain skeleton still shows
 * underneath) -- this app's DesktopOnlyGate already blocks the app
 * broadly on real mobile devices, this is an extra, local safeguard
 * specifically for this visual effect.
 *
 * Usage (in any page, wherever a skeleton is currently rendered):
 *
 *   if (!data) return (
 *     <LoadingOverlay>
 *       <DashboardSkeleton />
 *     </LoadingOverlay>
 *   )
 *
 * Place your real image file at: frontend/public/loading-overlay.png
 */
const IMAGE_SRC = '/images/apexfi-logo.png'

export default function LoadingOverlay({ children }) {
  return (
    <div className="relative">
      {children}

      <style>{`
        @keyframes loadingOverlayPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes loadingOverlayGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>

      {/* hidden below md breakpoint -- only shows on real desktop/tablet */}
      <div className="absolute inset-0 items-center justify-center hidden pointer-events-none md:flex">
        {/* colorful blurred glow behind the image */}
        <div
          style={{
            width: 'clamp(180px, 30vw, 340px)',
            height: 'clamp(180px, 30vw, 340px)',
            background:
              'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--risk-high)), hsl(var(--risk-low)), hsl(var(--primary)))',
            filter: 'blur(48px)',
            animation: 'loadingOverlayGlow 1.8s ease-in-out infinite',
          }}
          className="absolute rounded-full"
        />

        <img
          src={IMAGE_SRC}
          alt="Loading"
          style={{
            width: 'clamp(140px, 22vw, 260px)',
            height: 'clamp(140px, 22vw, 260px)',
            animation: 'loadingOverlayPulse 1.8s ease-in-out infinite',
          }}
          className="relative object-contain"
        />
      </div>
    </div>
  )
}