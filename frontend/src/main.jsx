import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PatientAuthProvider } from './context/PatientAuthContext.jsx';
import { VendorAuthProvider } from './context/VendorAuthContext.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PatientAuthProvider>
        <VendorAuthProvider>
          <App />
        </VendorAuthProvider>
      </PatientAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
