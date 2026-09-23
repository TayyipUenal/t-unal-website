import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/dm-serif-display/latin-400.css";
import "./styles.css";
import "./header.css";
import "./hero.css";
import "./legal.css";
import "./conversion.css";
import "./configurator.css";
import "./scc.css";
import "./story.css";
import "./sections.css";
import "./motion.css";
import "./intro.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
