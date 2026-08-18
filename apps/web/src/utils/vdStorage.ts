const oldPrefix = "vd_";
const newPrefix = "vd_";

export const migrateVdStorage = () => {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter((key) =>
    key.startsWith(oldPrefix),
  );
  for (const oldKey of keys) {
    const newKey = `${newPrefix}${oldKey.slice(oldPrefix.length)}`;
    if (localStorage.getItem(newKey) === null) {
      const value = localStorage.getItem(oldKey);
      if (value !== null) localStorage.setItem(newKey, value);
    }
    localStorage.removeItem(oldKey);
  }
};
