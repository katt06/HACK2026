// The only API module components should import. Which implementation is live
// is decided here by VITE_USE_MOCKS; callers can't tell the difference.
import { createMockApi, type MockControls, type MockSettings } from "./mockApi";
import { realApi } from "./realApi";
import type { Api } from "./types";

export type { Api } from "./types";

const SETTINGS_KEY = "mockApi.settings";

declare global {
  interface Window {
    mock?: MockControls;
  }
}

function loadSettings(): Partial<MockSettings> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveSettings(settings: MockSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode etc.): settings just won't persist.
  }
}

function pickApi(): Api {
  if (import.meta.env.VITE_USE_MOCKS !== "true") return realApi;

  const { api, controls } = createMockApi({ settings: loadSettings(), onSettingsChange: saveSettings });
  window.mock = controls;
  const { persona, errorRate } = controls.status();
  console.info(
    `%cMock API on%c as "${persona}"${errorRate ? `, error rate ${errorRate}` : ""}. ` +
      `Try mock.persona("steady-saver"), mock.errors(1, ["getSafeToSave"]), mock.errors(0), mock.simulateJoin("delivery-spender"), mock.reset(), mock.status().`,
    "background:#059669;color:white;padding:2px 6px;border-radius:4px",
    "",
  );
  return api;
}

export const api: Api = pickApi();
