import React from "react";
import ReactDOM from "react-dom/client";

// Bundled typefaces. Euclide is local and portable (USB key, classrooms with no
// network): fonts must ship with the app, not come from a CDN. Latin +
// latin-ext cover French; four weights plus one italic per family.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400-italic.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-500.css";
import "@fontsource/ibm-plex-mono/latin-ext-600.css";
import "@fontsource/ibm-plex-mono/latin-ext-700.css";

import App from "./App";
import "./styles.css";
import { ErrorBoundary } from "./components/ui";
import { ThemeProvider } from "./lib/theme";
import { startPerf } from "./lib/perf";
import { startReporting } from "./lib/report";

startReporting();
startPerf();

// Development only: ?gallery shows the UI kit (dev/Gallery.tsx) instead of
// the app. Production builds drop the branch and its chunk.
const Gallery = import.meta.env.DEV ? React.lazy(() => import("./dev/GalleryRoot")) : null;
const showGallery = Gallery !== null && new URLSearchParams(location.search).has("gallery");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        {showGallery && Gallery ? (
          <React.Suspense fallback={null}>
            <Gallery />
          </React.Suspense>
        ) : (
          <App />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
