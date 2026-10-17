import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
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

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
