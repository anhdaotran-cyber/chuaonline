import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ControlPage from "./ControlPage.jsx";
import "./index.css";

const path = window.location.pathname.replace(/\/+$/, "");
const Page = path.endsWith("/dieu-khien") ? ControlPage : App;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Page />
  </StrictMode>
);
