// Test page to verify guest token endpoint works
import { useEffect, useState } from 'react';
import { SupersetClient } from '@superset-ui/core';

export default function TestGuestToken() {
  const [status, setStatus] = useState('Testing...');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const testToken = async () => {
      try {
        setStatus('Making request to /api/v1/security/public_guest_token/...');

        const response = await SupersetClient.post({
          endpoint: '/api/v1/security/public_guest_token/',
          postPayload: { dashboard_id: '52' },
        });

        setStatus('✅ SUCCESS! Token received');
        setToken(response.json.token);
      } catch (err: any) {
        setStatus('❌ FAILED');
        setError(err?.message || String(err));
        console.error('Error:', err);
      }
    };

    testToken();
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace' }}>
      <h1>Guest Token Test</h1>
      <div style={{ marginTop: '20px' }}>
        <strong>Status:</strong> {status}
      </div>
      {token && (
        <div style={{ marginTop: '20px' }}>
          <strong>Token:</strong>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '10px',
              marginTop: '10px',
            }}
          >
            {token}
          </pre>
        </div>
      )}
      {error && (
        <div style={{ marginTop: '20px', color: 'red' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
