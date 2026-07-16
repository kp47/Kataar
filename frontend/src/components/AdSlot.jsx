/**
 * Placeholder ad unit. Deliberately plain and never placed on the screen
 * someone is anxiously watching for their number — see the note in
 * Dashboard.jsx for where this is (and isn't) used. Swap the inner content
 * for your ad network's real embed/script when you wire one up.
 */
export default function AdSlot({ label = 'Advertisement' }) {
  return (
    <div className="ad-slot">
      {label}
      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>Your ad network embed goes here</div>
    </div>
  );
}
