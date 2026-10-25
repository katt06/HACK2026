import { useEffect, useState } from "react";

// Chart colors as plain hex (not CSS variables) so an exported SVG/PNG looks the same outside the app.
// Series colors were run through the dataviz palette validator (all checks pass, light and dark).
export interface ChartPalette {
  surface: string;
  text: string;
  muted: string;
  grid: string;
  shared: string; // production picker
  independent: string; // textbook baseline
  epsilon: string;
  neutral: string; // random baseline
  reference: string; // oracle / reference lines
}

export const LIGHT: ChartPalette = {
  surface: "#ffffff",
  text: "#24332b",
  muted: "#5c6b61",
  grid: "#e8dfcc",
  shared: "#2f7d53",
  independent: "#2a6fc4",
  epsilon: "#d07a12",
  neutral: "#8a958c",
  reference: "#24332b",
};

export const DARK: ChartPalette = {
  surface: "#1b2b23",
  text: "#f2eee4",
  muted: "#a9b5ac",
  grid: "#2e463a",
  shared: "#46a673",
  independent: "#5590da",
  epsilon: "#c98220",
  neutral: "#7d8a81",
  reference: "#f2eee4",
};

// Follows the app's theme: html[data-theme] when set, otherwise the system setting.
export function useChartPalette(): ChartPalette {
  const read = () => {
    const forced = document.documentElement.dataset.theme;
    if (forced) return forced === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const update = () => setDark(read());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return dark ? DARK : LIGHT;
}
