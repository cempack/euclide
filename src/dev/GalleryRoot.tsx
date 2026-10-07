import { useEffect } from "react";
import { ConfirmProvider, ToastProvider } from "../components/ui";
import { useAppearance } from "../lib/theme";
import { TooltipLayer } from "../ui/Tooltip";
import Gallery from "./Gallery";

/** The gallery with the providers it needs; ?projection shows it projected. */
export default function GalleryRoot() {
  const { setProjection } = useAppearance();
  useEffect(() => {
    if (new URLSearchParams(location.search).has("projection")) setProjection(true);
  }, [setProjection]);
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Gallery />
        <TooltipLayer />
      </ConfirmProvider>
    </ToastProvider>
  );
}
