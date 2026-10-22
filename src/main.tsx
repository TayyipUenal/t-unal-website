import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./styles.css";
import "./header.css";
import "./hero.css";
import "./night.css";
import "./legal.css";
import "./conversion.css";
import "./configurator.css";
import "./scc.css";
import "./story.css";
import "./sections.css";
import "./motion.css";
import "./theme.css";
import "./fx.css";
import "./fx-sections.css";
import "./norm-check.css";
import "./brand.css";
import "./studio.css";
import "./whatsapp.css";
import "./nationwide.css";
import "./portal/portal.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);
// Portal and partner pages come from the SPA fallback (the home page HTML), so they are rendered fresh.
const dynamic = /^\/(portal|partner\/)/.test(window.location.pathname);
if (root.hasChildNodes() && !dynamic) hydrateRoot(root, app);
else createRoot(root).render(app);
