import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { auth } from './firebase'

// Global Firebase ID Token Injector for Fetch API
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init.headers = headers;
    } catch (e) {
      console.error("Error retrieving Firebase ID token:", e);
    }
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
