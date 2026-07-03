// localStorage persistence: global settings + up to 5 universe slots,
// plus JSON export/import. All writes guarded against quota errors.

const SETTINGS_KEY = 'fnaf.settings';
const SLOT_PREFIX = 'fnaf.slot.';
export const MAX_SLOTS = 5;

const DEFAULT_SETTINGS = {
  volume: 0.8,
  sfxVolume: 1.0,
  ambientVolume: 0.7,
  sensitivity: 1.0,
  quality: 'medium',
};

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

export function createSaves() {
  let settings = { ...DEFAULT_SETTINGS, ...(safeParse(localStorage.getItem(SETTINGS_KEY)) || {}) };

  const saves = {
    // ---- settings ----
    get: () => settings,
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      trySet(SETTINGS_KEY, JSON.stringify(settings));
      saves.onSettingsChanged?.(settings);
    },
    onSettingsChanged: null,

    // ---- slots ----
    listSlots() {
      const out = [];
      for (let i = 0; i < MAX_SLOTS; i++) {
        const raw = localStorage.getItem(SLOT_PREFIX + i);
        if (!raw) { out.push({ slot: i, empty: true }); continue; }
        const data = safeParse(raw);
        if (!data?.meta) { out.push({ slot: i, empty: true, corrupt: true }); continue; }
        out.push({
          slot: i,
          empty: false,
          name: data.meta.name,
          pizzeria: data.meta.pizzeriaName,
          night: data.progress?.night ?? 1,
          updatedAt: data.meta.updatedAt,
        });
      }
      return out;
    },

    loadSlot(slot) {
      return safeParse(localStorage.getItem(SLOT_PREFIX + slot));
    },

    saveSlot(slot, universe) {
      universe.meta.updatedAt = Date.now();
      return trySet(SLOT_PREFIX + slot, JSON.stringify(universe));
    },

    deleteSlot(slot) {
      localStorage.removeItem(SLOT_PREFIX + slot);
    },

    firstFreeSlot() {
      for (let i = 0; i < MAX_SLOTS; i++) {
        if (!localStorage.getItem(SLOT_PREFIX + i)) return i;
      }
      return -1;
    },

    // ---- export/import ----
    exportUniverse(universe) {
      const blob = new Blob([JSON.stringify(universe, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(universe.meta.name || 'universe').replace(/[^a-z0-9-_ ]/gi, '')}.fazsim.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },

    importUniverseFile() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const reader = new FileReader();
          reader.onload = () => resolve(safeParse(reader.result));
          reader.onerror = () => resolve(null);
          reader.readAsText(file);
        };
        input.click();
      });
    },
  };

  return saves;
}

function trySet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error('localStorage write failed (quota?) — use Export instead.', err);
    return false;
  }
}
