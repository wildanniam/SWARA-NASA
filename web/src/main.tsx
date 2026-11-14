import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { isAppRoute } from "./route";

// Landing page dan aplikasi dimuat sebagai bagian kode terpisah: pengunjung landing page
// tidak perlu mengunduh mesin peta dan suara aplikasi, dan sebaliknya.
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const Landing = lazy(() => import("./landing/Landing").then((m) => ({ default: m.Landing })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>{isAppRoute() ? <App /> : <Landing />}</Suspense>
  </StrictMode>,
);
