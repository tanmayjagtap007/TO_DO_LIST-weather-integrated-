let input = document.getElementById("taskInput");
let addButton = document.getElementById("addButton");
let taskList = document.getElementById("taskList");
let count = document.querySelector(".count");
let completedText = document.getElementById("completedText");
let progressFill = document.querySelector(".progress-fill");
let percentage = document.getElementById("percentage");

// ---------- To-do data ----------

let tasksByDate = {};

try {
  let saved = localStorage.getItem("taskByDate");

  if (saved) {
    tasksByDate = JSON.parse(saved);
  }
} catch (error) {
  console.error("Could not load saved tasks:", error);
}

function saveTasks() {
  try {
    localStorage.setItem("taskByDate", JSON.stringify(tasksByDate));
  } catch (error) {
    console.error("Could not save tasks:", error);
  }
}

// Turns a date into text like "2026-10-09"
function getDateKey(date) {
  let month = String(date.getMonth() + 1).padStart(2, "0");
  let day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

// Returns the task list for the selected date (creates an empty one if needed)
function getTasksForSelectedDate() {
  let key = getDateKey(selectedDate);

  if (!tasksByDate[key]) {
    tasksByDate[key] = [];
  }

  return tasksByDate[key];
}

// True if this date has at least one task that is not done
function hasPendingTasks(date) {
  let tasks = tasksByDate[getDateKey(date)];

  if (!tasks) {
    return false;
  }

  for (let i = 0; i < tasks.length; i++) {
    if (!tasks[i].done) {
      return true;
    }
  }

  return false;
}

// Draws the task list on the screen from the data
function renderTasks() {
  taskList.innerHTML = "";

  let tasks = getTasksForSelectedDate();

  for (let i = 0; i < tasks.length; i++) {
    let task = tasks[i];

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

    checkbox.addEventListener("change", function() {
      task.done = checkbox.checked;
      saveTasks();
      renderTasks();
    });

    deleteButton.addEventListener("click", function() {
      tasks.splice(i, 1);
      saveTasks();
      renderTasks();
    });

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteButton);
    taskList.appendChild(li);
  }

  updateStats();
  buildCalendar();
}

addButton.addEventListener("click", function() {
  let taskText = input.value.trim();

  if (taskText === "") {
    alert("Please enter a task");
    return;
  }

  getTasksForSelectedDate().push({ text: taskText, done: false });

  saveTasks();

  input.value = "";
  renderTasks();
});

function updateStats() {
  let tasks = getTasksForSelectedDate();
  let completed = 0;

  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].done) {
      completed++;
    }
  }

  let remaining = tasks.length - completed;
  let progress = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  count.textContent = remaining + " tasks remaining";
  completedText.textContent = completed + " of " + tasks.length + " tasks completed";
  progressFill.style.width = progress + "%";
  percentage.textContent = progress + "%";
}

// working of calander

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

    if (hasPendingTasks(new Date(currentYear, currentMonth, day))) {
      box.classList.add("has-tasks");
    }

    box.addEventListener("click", function() {
      selectedDate = new Date(currentYear, currentMonth, day);
      showDate(selectedDate);
      renderTasks();
      buildCalendar();
    });

    calendarDays.appendChild(box);
  }
}

//----------------------------------------------------------\\

prevMonthButton.addEventListener("click", function() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  buildCalendar();
});

nextMonthButton.addEventListener("click", function() {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  buildCalendar();
});

buildCalendar();

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
  renderTasks();
  buildCalendar();
});

// Draw the task list for the first time
renderTasks();