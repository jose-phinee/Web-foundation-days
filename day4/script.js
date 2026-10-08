const MAX_CHARS = 200;
const WARN_AT = 180;

const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

function updateCounts() {
  const text = noteText.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;

  charCount.classList.toggle("warning", chars > WARN_AT && chars <= MAX_CHARS);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
  noteText.focus();
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("draft", noteText.value);
});

clearBtn.addEventListener("click", clearAll);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearAll();
});

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// On load: restore draft and theme, then update counters
noteText.value = localStorage.getItem("draft") || "";
applyTheme(localStorage.getItem("theme") === "dark");
updateCounts();