import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          QueueWise
        </div>
        <div className="row">
          <Link to="/" className="btn btn-secondary">
            Browse queues
          </Link>
          <Link to="/vendor/login" className="btn btn-secondary">
            Vendor login
          </Link>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 720, paddingTop: 56 }}>
        <div className="eyebrow">For clinics, salons, service counters &amp; any walk-in business</div>
        <h1 style={{ fontSize: 40, lineHeight: 1.15, marginTop: 12 }}>
          Your number, from wherever you're waiting.
        </h1>
        <p className="muted" style={{ fontSize: 17, marginTop: 16, lineHeight: 1.6 }}>
          Patients and customers get a token on their phone, watch the live queue, and only walk in
          when their number is close — instead of sitting in a packed waiting room for an hour.
          Free for businesses to set up.
        </p>

        <div className="row" style={{ marginTop: 32 }}>
          <Link to="/vendor/signup" className="btn btn-primary btn-lg">
            Set up your queue — free
          </Link>
          <Link to="/vendor/login" className="btn btn-secondary btn-lg">
            I already have an account
          </Link>
        </div>

        <div className="grid-2" style={{ marginTop: 56 }}>
          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>For customers</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
              Get a token by email — no app to install. See the live number and an honest wait
              estimate. Running late once? Push your turn back and keep your place.
            </p>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>For businesses</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
              One screen to call the next number, skip a no-show, or pause the queue. Set your
              hours, daily capacity, and how long a token stays valid — all configurable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
