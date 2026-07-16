/** Renders a number as individual split-flap tiles, e.g. 07 -> [0][7]. */
export default function FlipNumber({ value, size = 'normal', minDigits = 2 }) {
  const str = value === null || value === undefined ? '--' : String(value).padStart(minDigits, '0');
  const chars = str.split('');
  return (
    <div className={`flip-board ${size === 'small' ? 'small' : size === 'large' ? 'large' : ''}`} aria-label={`Number ${str}`}>
      {chars.map((ch, i) => (
        <div className="flip-tile" key={i}>
          {ch}
        </div>
      ))}
    </div>
  );
}
