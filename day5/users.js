// ---------- Select elements ----------
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusMessage = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

// ---------- Data ----------
const API_URL = "https://jsonplaceholder.typicode.com/users";
let users = []; // all loaded users are stored here

// ---------- Load users from the API ----------
async function loadUsers() {
  loadButton.disabled = true;
  statusMessage.textContent = "Loading users...";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    applyFilter();
    statusMessage.textContent = `Loaded ${users.length} users successfully.`;
  } catch (error) {
    statusMessage.textContent = `Error: could not load users. ${error.message}`;
  } finally {
    loadButton.disabled = false;
  }
}

// ---------- Draw a list of users ----------
function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  list.forEach(function (user) {
    const item = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("p");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("p");
    company.textContent = `Company: ${user.company.name}`;

    item.append(name, email, city, company);
    usersList.appendChild(item);
  });
}

// ---------- Filter the stored users (no new request) ----------
function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter(function (user) {
    return user.name.toLowerCase().includes(term);
  });
  renderUsers(matches);
}

// ---------- Events ----------
loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", function () {
  if (users.length === 0) {
    return; // nothing loaded yet
  }
  applyFilter();
});