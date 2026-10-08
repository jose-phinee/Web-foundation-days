// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const validCategories = ["personal", "work", "study"];

// ---------- 1. searchNotes ----------
// Returns an array of notes whose text contains the word (ignoring case).
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(search);
  });
}

// ---------- 2. longestNote ----------
// Returns the note with the most characters, or null if there are no notes.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// ---------- 3. countByCategory ----------
// Returns an object counting the notes in each category.
function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// ---------- 4. getSummary ----------
// Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  return `${total} ${word}: ${counts.personal} personal, ${counts.work} work, ${counts.study} study.`;
}

// ---------- 5. isDuplicate ----------
// Returns true if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const clean = text.trim().toLowerCase();
  return notes.some(function (note) {
    return note.text.trim().toLowerCase() === clean;
  });
}

// ---------- 6. addNote ----------
// Adds a note only if it is valid. Returns true when added, false otherwise.
function addNote(text, category) {
  const clean = text.trim();

  if (clean.length < 1 || clean.length > 200) {
    console.log("Not added: note must be between 1 and 200 characters.");
    return false;
  }
  if (isDuplicate(clean)) {
    console.log("Not added: this note already exists.");
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  const nextId = notes.length === 0 ? 1 : Math.max(...notes.map((n) => n.id)) + 1;
  notes.push({ id: nextId, text: clean, category: category });
  return true;
}

// ---------- Tests ----------
console.log("--- searchNotes ---");
console.log(searchNotes("call"));
// Expected: [ { id: 5, text: "Call mum", category: "personal" } ]
console.log(searchNotes("xyz"));
// Expected: [] (no results)

console.log("--- longestNote ---");
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());
// Expected: null (no notes)
notes = savedNotes;

console.log("--- countByCategory ---");
console.log(countByCategory());
// Expected: { personal: 2, work: 1, study: 2 }
notes = [];
console.log(countByCategory());
// Expected: { personal: 0, work: 0, study: 0 }
notes = savedNotes;

console.log("--- getSummary ---");
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "Only note", category: "work" }];
console.log(getSummary());
// Expected: "1 note: 0 personal, 1 work, 0 study."
notes = savedNotes;

console.log("--- isDuplicate ---");
console.log(isDuplicate("  buy MILK and bread  "));
// Expected: true
console.log(isDuplicate("Water the plants"));
// Expected: false

console.log("--- addNote ---");
console.log(addNote("Water the plants", "personal"));
// Expected: true
console.log(addNote("water the plants", "personal"));
// Expected: "Not added: this note already exists." then false
console.log(addNote("", "work"));
// Expected: "Not added: note must be between 1 and 200 characters." then false
console.log(addNote("a".repeat(201), "work"));
// Expected: "Not added: note must be between 1 and 200 characters." then false
console.log(addNote("Plan the budget", "hobby"));
// Expected: "Not added: category must be personal, work or study." then false
console.log(getSummary());
// Expected: "6 notes: 3 personal, 1 work, 2 study."