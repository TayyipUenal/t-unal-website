import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter-tight/latin-600.css";
import "@fontsource/inter-tight/latin-700.css";
import "@fontsource/inter-tight/latin-800.css";
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
import "./intro.css";
import "./theme.css";
import "./fx.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
