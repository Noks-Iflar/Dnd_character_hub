/** Character portrait inside the brush ring; the first letter of the name when there is no picture. */
export function Portrait({ src, name, size = 104, spin = -20 }: { src: string | null; name: string; size?: number; spin?: number }) {
  return (
    <div className="portrait-ring" style={{ ['--size' as string]: `${size}px`, ['--spin' as string]: `${spin}deg` }}>
      {src ? (
        <img className="portrait" src={src} alt={`Портрет: ${name}`} />
      ) : (
        <div className="portrait portrait-empty" aria-hidden="true" style={{ fontSize: size * 0.36 }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  )
}
