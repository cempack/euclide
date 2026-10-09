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
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, startDataBridge } from "./api/client";
import { startTabSession } from "./stores/tabs";
import { startShortcuts } from "./lib/keymap";
import { startThumbnailer } from "./features/previews/thumbnailer";

startReporting();
startPerf();
startDataBridge();
startTabSession();
startShortcuts();
startThumbnailer();

// Development only: ?gallery shows the UI kit (dev/Gallery.tsx) instead of
// the app. Production builds drop the branch and its chunk.
// ?pdf shows the PDF view on a sample document (or ?pdf=<url>).
// ?pdfium, the same with PDFium (dev/PdfiumSpike.tsx).
// ?recap lays out the release recap (dev/Recap.tsx) for scripts/changelog.
const devPage = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const Gallery = devPage?.has("gallery")
  ? React.lazy(() => import("./dev/GalleryRoot"))
  : devPage?.has("pdf")
    ? React.lazy(() => import("./dev/PdfSpike"))
    : devPage?.has("pdfium")
      ? React.lazy(() => import("./dev/PdfiumSpike"))
      : devPage?.has("recap")
        ? React.lazy(() => import("./dev/Recap"))
        : null;
const showGallery = Gallery !== null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          {showGallery && Gallery ? (
            <React.Suspense fallback={null}>
              <Gallery />
            </React.Suspense>
          ) : (
            <App />
          )}
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
