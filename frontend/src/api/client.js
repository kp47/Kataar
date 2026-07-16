import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true, // sends/receives the httpOnly session cookies
});

/** Small helper so components can do `const {data, error} = await call(api.get('/x'))` style handling. */
export function extractErrorMessage(err) {
  return err?.response?.data?.error || 'Something went wrong. Please try again.';
}

export { API_BASE_URL };
