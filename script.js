// ---------- Settings ----------

const API_URL = "http://127.0.0.1:8000/api";

// ---------- Page elements ----------

let input = document.getElementById("taskInput");
let addButton = document.getElementById("addButton");
let taskList = document.getElementById("taskList");
let count = document.querySelector(".count");
let completedText = document.getElementById("completedText");
let progressFill = document.querySelector(".progress-fill");
let percentage = document.getElementById("percentage");

// ---------- Talking to the backend ----------

const TOKEN_KEY = "todoToken";
let authToken = null;               // the login token (null = not logged in)

try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch (error) {
  console.error("Could not read the saved login:", error);
}

function saveToken(token) {
  authToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error("Could not save the login:", error);
  }
}

function clearToken() {
  authToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error("Could not clear the login:", error);
  }
}

// Sends a request to the backend (with the login token) and returns its JSON answer
async function api(path, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers);

  if (authToken) {
    options.headers["Authorization"] = "Bearer " + authToken;
  }

  let response = await fetch(API_URL + path, options);

  if (response.status === 401) {
    logout("Your session has expired. Please log in again.");
  }

  if (!response.ok) {
    let error = new Error("Server replied with status " + response.status);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;                        // 204 = success, nothing to return
  }

  return await response.json();
}

// Builds the options for a request that carries JSON data
function sendJson(method, body) {
  return {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function showServerError(error) {
  if (error.status === 401) {
    return;                             // api() already switched to guest mode
  }
  console.error("Server problem:", error);
  count.textContent = "Cannot reach the server. Is the backend running?";
}

// ---------- Guest task storage ----------

const GUEST_KEY = "guestTasks";

function readGuestTasks() {
  try {
    let tasks = JSON.parse(localStorage.getItem(GUEST_KEY));
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    console.error("Could not read guest tasks:", error);
    return [];
  }
}

function writeGuestTasks(tasks) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error("Could not save guest tasks:", error);
  }
}

async function fetchTasks(dateKey) {
  if (authToken) {
    return await api("/tasks?date=" + dateKey);
  }

  return readGuestTasks().filter(function(task) {
    return task.date === dateKey;
  });
}

async function fetchPendingDates(month) {
  if (authToken) {
    return await api("/pending-dates?month=" + month);
  }

  let dates = [];
  let tasks = readGuestTasks();

  for (let i = 0; i < tasks.length; i++) {
    let task = tasks[i];
    if (!task.done && task.date.startsWith(month) && !dates.includes(task.date)) {
      dates.push(task.date);
    }
  }

  return dates;
}

async function createTask(text, dateKey) {
  if (authToken) {
    await api("/tasks", sendJson("POST", { text: text, date: dateKey }));
    return;
  }

  let tasks = readGuestTasks();
  tasks.push({ id: Date.now(), text: text, date: dateKey, done: false });
  writeGuestTasks(tasks);
}

async function setTaskDone(id, done) {
  if (authToken) {
    await api("/tasks/" + id, sendJson("PATCH", { done: done }));
    return;
  }

  let tasks = readGuestTasks();
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      tasks[i].done = done;
    }
  }
  writeGuestTasks(tasks);
}

async function removeTask(id) {
  if (authToken) {
    await api("/tasks/" + id, { method: "DELETE" });
    return;
  }

  let tasks = readGuestTasks().filter(function(task) {
    return task.id !== id;
  });
  writeGuestTasks(tasks);
}

// ---------- Login pop-up ----------

let authScreen = document.getElementById("authScreen");
let authForm = document.getElementById("authForm");
let authTitle = document.getElementById("authTitle");
let authEmail = document.getElementById("authEmail");
let authPassword = document.getElementById("authPassword");
let authSubmit = document.getElementById("authSubmit");
let authToggle = document.getElementById("authToggle");
let authClose = document.getElementById("authClose");
let authError = document.getElementById("authError");
let userEmail = document.getElementById("userEmail");
let loginButton = document.getElementById("loginButton");
let logoutButton = document.getElementById("logoutButton");

let authMode = "login";                 // "login" or "register"

function setAuthMode(mode) {
  authMode = mode;
  authError.textContent = "";

  if (mode === "login") {
    authTitle.textContent = "Log in";
    authSubmit.textContent = "Log in";
    authToggle.textContent = "New here? Create an account";
    authPassword.autocomplete = "current-password";
    authPassword.placeholder = "";
  } else {
    authTitle.textContent = "Create account";
    authSubmit.textContent = "Create account";
    authToggle.textContent = "Already have an account? Log in";
    authPassword.autocomplete = "new-password";
    authPassword.placeholder = "At least 8 characters";
  }
}

function showAuthScreen(message) {
  authScreen.classList.remove("hidden");
  authError.textContent = message || "";
  authPassword.value = "";
  authEmail.focus();
}

function closeAuthScreen() {
  authScreen.classList.add("hidden");
}

function updateUserBox(email) {
  if (email) {
    userEmail.textContent = email;
    loginButton.classList.add("hidden");
    logoutButton.classList.remove("hidden");
  } else {
    userEmail.textContent = "Guest: tasks are saved only in this browser";
    loginButton.classList.remove("hidden");
    logoutButton.classList.add("hidden");
  }
}

function logout(message) {
  clearToken();
  updateUserBox();
  setAuthMode("login");
  loadTasks();
  loadPendingDates();

  if (message) {
    showAuthScreen(message);
  }
}

// Sends the email and password to /login or /register and returns the token
async function requestToken(mode, email, password) {
  let response = await fetch(API_URL + "/" + mode, sendJson("POST", {
    email: email,
    password: password
  }));

  if (response.ok) {
    let data = await response.json();
    return data.token;
  }

  if (response.status === 401) {
    throw new Error("Wrong email or password.");
  }
  if (response.status === 409) {
    throw new Error("That email is already registered. Try logging in.");
  }
  if (response.status === 422) {
    throw new Error("Enter a valid email and a password of at least 8 characters.");
  }
  throw new Error("Something went wrong (status " + response.status + ").");
}

authForm.addEventListener("submit", async function(event) {
  event.preventDefault();               // stop the browser from reloading the page
  authError.textContent = "";
  authSubmit.disabled = true;

  try {
    let token = await requestToken(authMode, authEmail.value.trim(), authPassword.value);
    saveToken(token);

    let user = await api("/me");
    authEmail.value = "";
    closeAuthScreen();
    updateUserBox(user.email);
    loadTasks();
    loadPendingDates();
  } catch (error) {
    if (error instanceof TypeError) {   // fetch itself failed: no connection to the server
      authError.textContent = "Cannot reach the server. Is the backend running?";
    } else if (error.status !== 401) {
      authError.textContent = error.message;
    }
  }

  authSubmit.disabled = false;
});

authToggle.addEventListener("click", function() {
  setAuthMode(authMode === "login" ? "register" : "login");
});

loginButton.addEventListener("click", function() {
  setAuthMode("login");
  showAuthScreen();
});

authClose.addEventListener("click", function() {
  closeAuthScreen();
  authError.textContent = "";
  authPassword.value = "";
  updateUserBox();
  loadTasks();
  loadPendingDates();
});

authScreen.addEventListener("click", function(event) {
  if (event.target === authScreen) {
    closeAuthScreen();
  }
});

document.addEventListener("keydown", function(event) {
  if (event.key === "Escape" && !authScreen.classList.contains("hidden")) {
    closeAuthScreen();
  }
});

logoutButton.addEventListener("click", function() {
  logout();
});

// Runs once when the page opens: are we already logged in?
async function startApp() {
  setAuthMode("login");
  updateUserBox();

  if (authToken) {
    try {
      let user = await api("/me");
      updateUserBox(user.email);
    } catch (error) {
      if (error.status === 401) {
        return;                         // api() already switched to guest mode
      }
      updateUserBox("Logged in");
    }
  }

  loadTasks();
  loadPendingDates();

  if (!authToken) {
    try {
      let response = await fetch(API_URL + "/hello");
      if (!response.ok) {
        throw new Error("Server replied with status " + response.status);
      }
      showAuthScreen();
    } catch (error) {
      showAuthScreen("Cannot reach the server. Is the backend running?");
    }
  }
}

// ---------- To-do data ----------

let currentTasks = [];   // tasks of the selected date, loaded from the server
let pendingDates = [];   // dates in the shown month that still have unfinished tasks

// Turns a date into text like "2026-10-09"
function getDateKey(date) {
  let month = String(date.getMonth() + 1).padStart(2, "0");
  let day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

// Gets the selected date's tasks and draws them
async function loadTasks() {
  try {
    currentTasks = await fetchTasks(getDateKey(selectedDate));
    renderTasks();
  } catch (error) {
    showServerError(error);
  }
}

// Gets dates in the shown month that have unfinished tasks, then redraws the calendar
async function loadPendingDates() {
  let month = currentYear + "-" + String(currentMonth + 1).padStart(2, "0");

  try {
    pendingDates = await fetchPendingDates(month);
  } catch (error) {
    pendingDates = [];
    showServerError(error);
  }

  buildCalendar();
}

// After any change: reload the day's tasks and the calendar dots
async function refreshAfterChange() {
  await loadTasks();
  await loadPendingDates();
}

// Draws the task list on the screen from currentTasks
function renderTasks() {
  taskList.innerHTML = "";

  for (let i = 0; i < currentTasks.length; i++) {
    let task = currentTasks[i];

    let li = document.createElement("li");
    if (task.done) {
      li.classList.add("done");
    }

    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;

    let span = document.createElement("span");
    span.textContent = task.text;

    let deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "delete";

    checkbox.addEventListener("change", async function() {
      try {
        await setTaskDone(task.id, checkbox.checked);
        await refreshAfterChange();
      } catch (error) {
        showServerError(error);
      }
    });

    deleteButton.addEventListener("click", async function() {
      try {
        await removeTask(task.id);
        await refreshAfterChange();
      } catch (error) {
        showServerError(error);
      }
    });

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteButton);
    taskList.appendChild(li);
  }

  updateStats();
}

addButton.addEventListener("click", async function() {
  let taskText = input.value.trim();

  if (taskText === "") {
    alert("Please enter a task");
    return;
  }

  try {
    await createTask(taskText, getDateKey(selectedDate));

    input.value = "";
    await refreshAfterChange();
  } catch (error) {
    showServerError(error);
  }
});

function updateStats() {
  let total = currentTasks.length;
  let completed = 0;

  for (let i = 0; i < total; i++) {
    if (currentTasks[i].done) {
      completed++;
    }
  }

  let remaining = total - completed;
  let progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  count.textContent = remaining + " tasks remaining";
  completedText.textContent = completed + " of " + total + " tasks completed";
  progressFill.style.width = progress + "%";
  percentage.textContent = progress + "%";
}

// ---------- Date heading ----------

let dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep","Oct","Nov", "Dec"];

let dateHeading = document.getElementById("dateHeading");

function showDate(date) {
  let dayName = dayNames[date.getDay()];
  let dayNumber = date.getDate();
  let monthName = monthNames[date.getMonth()];
  let year = date.getFullYear();

  dateHeading.textContent = dayName + ", " + dayNumber + " " + monthName + " " + year;
}

showDate(new Date());

// ---------- Calendar builder ----------

let fullMonthNames = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

let monthTitle = document.getElementById("monthTitle");
let calendarDays = document.getElementById("calendarDays");
let prevMonthButton = document.getElementById("prevMonth");
let nextMonthButton = document.getElementById("nextMonth");

let now = new Date();
let currentMonth = now.getMonth();
let currentYear = now.getFullYear();
let selectedDate = new Date();          // the date the user picked (starts as today)

function buildCalendar() {
  calendarDays.innerHTML = "";

  monthTitle.textContent = fullMonthNames[currentMonth] + " " + currentYear;

  let firstWeekday = new Date(currentYear, currentMonth, 1).getDay();
  let daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // 1. Faded days from the previous month
  for (let i = firstWeekday; i > 0; i--) {
    let box = document.createElement("div");
    box.textContent = daysInPrevMonth - i + 1;
    box.className = "other-month";
    calendarDays.appendChild(box);
  }

  // 2. The real days of this month
  for (let day = 1; day <= daysInMonth; day++) {
    let box = document.createElement("div");
    box.textContent = day;

    let isToday = day === now.getDate() &&
                  currentMonth === now.getMonth() &&
                  currentYear === now.getFullYear();

    let isSelected = day === selectedDate.getDate() &&
                     currentMonth === selectedDate.getMonth() &&
                     currentYear === selectedDate.getFullYear();

    if (isToday) {
      box.classList.add("today");
    }

    if (isSelected) {
      box.classList.add("selected-date");
    }

    if (pendingDates.includes(getDateKey(new Date(currentYear, currentMonth, day)))) {
      box.classList.add("has-tasks");
    }

    box.addEventListener("click", function() {
      selectedDate = new Date(currentYear, currentMonth, day);
      showDate(selectedDate);
      loadTasks();
      buildCalendar();
    });

    calendarDays.appendChild(box);
  }
}

prevMonthButton.addEventListener("click", function() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  loadPendingDates();
});

nextMonthButton.addEventListener("click", function() {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  loadPendingDates();
});

// ---------- Live weather ----------

let weatherUrl = "https://api.open-meteo.com/v1/forecast" +
  "?latitude=18.52&longitude=73.86" +
  "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
  "&wind_speed_unit=ms";

let weatherIcon = document.getElementById("weatherIcon");
let weatherCondition = document.getElementById("weatherCondition");
let temperatureText = document.getElementById("temperature");
let humidityText = document.getElementById("humidity");
let windSpeedText = document.getElementById("windSpeed");

// Converts the API's weather code number into words and an icon
let weatherCodes = {
  0:  { text: "Clear Sky",           icon: "ri-sun-line" },
  1:  { text: "Mostly Clear",        icon: "ri-sun-line" },
  2:  { text: "Partly Cloudy",       icon: "ri-sun-cloudy-line" },
  3:  { text: "Overcast",            icon: "ri-cloudy-line" },
  45: { text: "Fog",                 icon: "ri-foggy-line" },
  48: { text: "Fog",                 icon: "ri-foggy-line" },
  51: { text: "Light Drizzle",       icon: "ri-drizzle-line" },
  53: { text: "Drizzle",             icon: "ri-drizzle-line" },
  55: { text: "Heavy Drizzle",       icon: "ri-drizzle-line" },
  61: { text: "Light Rain",          icon: "ri-rainy-line" },
  63: { text: "Rain",                icon: "ri-rainy-line" },
  65: { text: "Heavy Rain",          icon: "ri-heavy-showers-line" },
  71: { text: "Light Snow",          icon: "ri-snowy-line" },
  73: { text: "Snow",                icon: "ri-snowy-line" },
  75: { text: "Heavy Snow",          icon: "ri-snowy-line" },
  80: { text: "Rain Showers",        icon: "ri-showers-line" },
  81: { text: "Rain Showers",        icon: "ri-showers-line" },
  82: { text: "Heavy Showers",       icon: "ri-heavy-showers-line" },
  95: { text: "Thunderstorm",        icon: "ri-thunderstorms-line" },
  96: { text: "Thunderstorm & Hail", icon: "ri-thunderstorms-line" },
  99: { text: "Thunderstorm & Hail", icon: "ri-thunderstorms-line" }
};

function showWeatherLoading() {
  weatherCondition.textContent = "Loading...";
  temperatureText.textContent = "--";
  humidityText.textContent = "--";
  windSpeedText.textContent = "--";
}

async function getWeather() {
  try {
    let response = await fetch(weatherUrl);

    if (!response.ok) {
      throw new Error("Server replied with status " + response.status);
    }

    let data = await response.json();
    let current = data.current;

    let info = weatherCodes[current.weather_code] ||
               { text: "Unknown", icon: "ri-question-line" };

    temperatureText.textContent = Math.round(current.temperature_2m) + "°C";
    humidityText.textContent = current.relative_humidity_2m + "%";
    windSpeedText.textContent = current.wind_speed_10m.toFixed(1) + " m/s";
    weatherCondition.textContent = info.text;
    weatherIcon.className = info.icon;

    console.log("Weather updated at", new Date().toLocaleTimeString());

  } catch (error) {
    console.error("Weather failed:", error);
    weatherCondition.textContent = "Weather unavailable";
    weatherIcon.className = "ri-cloud-off-line";
  }
}

showWeatherLoading();
getWeather();

setInterval(getWeather, 30 * 60 * 1000);

// ---------- Today button ----------

let todayButton = document.querySelector(".today-button");

todayButton.addEventListener("click", function() {
  let today = new Date();

  selectedDate = today;
  currentMonth = today.getMonth();
  currentYear = today.getFullYear();

  showDate(selectedDate);
  loadTasks();
  loadPendingDates();
});

// ---------- Start ----------

startApp();