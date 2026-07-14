import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App";

// Suppress non-critical console noise
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg.includes('sandbox') ||
    msg.includes('Violation') ||
    msg.includes('handler took') ||
    msg.includes('React Router Future')
  ) return;
  originalWarn.apply(console, args);
};

console.error = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg.includes('woff2') ||
    msg.includes('net::ERR_ABORTED') ||
    msg.includes('favicon') ||
    msg.includes('Failed to load resource')
  ) return;
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);