import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, extractErrorMessage } from '../../api/client';
import { usePatientAuth } from '../../context/PatientAuthContext';

export default function VerifyMagicLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = usePatientAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/';

    if (!token) {
      setError('This link is missing its verification code.');
      return;
    }

    api
      .post('/auth/verify', { token })
      .then(async () => {
        await refresh();
        navigate(next, { replace: true });
      })
      .catch((err) => setError(extractErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container" style={{ paddingTop: 100, textAlign: 'center' }}>
      {error ? (
        <>
          <h2 style={{ marginBottom: 12 }}>Link didn't work</h2>
          <p className="error-text">{error}</p>
          <p className="muted" style={{ marginTop: 16 }}>Go back and request a new sign-in link.</p>
        </>
      ) : (
        <p className="muted">Signing you in…</p>
      )}
    </div>
  );
}
