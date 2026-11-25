"use strict";

const expressionDisplay = document.getElementById("expression");
const resultDisplay = document.getElementById("result");
const display = document.getElementById("display");
const hint = document.getElementById("displayHint");
const angleLabel = document.getElementById("angleMode");
const angleButton = document.getElementById("angleToggle");
const historyList = document.getElementById("historyList");
const toast = document.getElementById("toast");
const history = [];
let expression = "";
let angleMode = "DEG";
let soundEnabled = true;
let lastAnswer = 0;
let toastTimer;
let audioContext;

const functionNames = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "sqrt", "recip"]);
const operatorSymbols = new Set(["+", "-", "×", "÷", "^"]);
const precedence = { "+": 1, "-": 1, "×": 2, "÷": 2, "u+": 3, "u-": 3, "^": 4 };

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const numberMatch = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    const nameMatch = rest.match(/^[a-zA-Z]+/);
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) throw new Error("That number is too large.");
      tokens.push({ type: "number", value });
      index += numberMatch[0].length;
      continue;
    }
    if (nameMatch) {
      const name = nameMatch[0].toLowerCase();
      if (name === "pi") tokens.push({ type: "number", value: Math.PI });
      else if (name === "e") tokens.push({ type: "number", value: Math.E });
      else if (functionNames.has(name)) tokens.push({ type: "function", value: name });
      else throw new Error(`Unknown function: ${name}`);
      index += nameMatch[0].length;
      continue;
    }
    if (source[index] === "π") {
      tokens.push({ type: "number", value: Math.PI });
      index += 1;
      continue;
    }
    const char = source[index];
    if ("+-×÷^()!%".includes(char)) {
      if (char === "−") tokens.push({ type: "operator", value: "-" });
      else if (char === "!") tokens.push({ type: "postfix", value: "!" });
      else if (char === "%") tokens.push({ type: "postfix", value: "%" });
      else if (char === "(" || char === ")") tokens.push({ type: "paren", value: char });
      else tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    throw new Error(`I don't recognize "${char}".`);
  }
  return tokens;
}

function toPostfix(tokens) {
  const output = [];
  const operators = [];
  let expectsValue = true;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "number") {
      if (!expectsValue) throw new Error("Add an operator between values.");
      output.push(token);
      expectsValue = false;
    } else if (token.type === "function") {
      if (!expectsValue) throw new Error("Add an operator before the function.");
      operators.push(token);
    } else if (token.type === "postfix") {
      if (expectsValue) throw new Error("Put a number before that symbol.");
      output.push(token);
    } else if (token.type === "paren" && token.value === "(") {
      if (!expectsValue) throw new Error("Add an operator before the bracket.");
      operators.push(token);
      expectsValue = true;
    } else if (token.type === "paren" && token.value === ")") {
      if (expectsValue) throw new Error("Check the values inside your brackets.");
      while (operators.length && !(operators[operators.length - 1].type === "paren" && operators[operators.length - 1].value === "(")) {
        output.push(operators.pop());
      }
      if (!operators.length) throw new Error("There's a closing bracket without a pair.");
      operators.pop();
      if (operators.length && operators[operators.length - 1].type === "function") output.push(operators.pop());
      expectsValue = false;
    } else if (token.type === "operator") {
      let symbol = token.value;
      const unary = expectsValue;
      if (expectsValue) {
        if (symbol !== "+" && symbol !== "-") throw new Error("That operator needs a value first.");
        symbol = symbol === "+" ? "u+" : "u-";
      }
      const rightAssociative = symbol === "^" || symbol === "u+" || symbol === "u-";
      while (!unary && operators.length && operators[operators.length - 1].type === "operator") {
        const top = operators[operators.length - 1].value;
        if (precedence[top] > precedence[symbol] || (!rightAssociative && precedence[top] === precedence[symbol])) output.push(operators.pop());
        else break;
      }
      operators.push({ type: "operator", value: symbol });
      expectsValue = true;
    }
  }
  if (!tokens.length) throw new Error("Enter a little expression first.");
  if (expectsValue) throw new Error("Your expression needs one more value.");
  while (operators.length) {
    const token = operators.pop();
    if (token.type === "paren") throw new Error("One of your brackets is still open.");
    output.push(token);
  }
  return output;
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("Factorial needs a whole number from 0 to 170.");
  if (value > 170) throw new Error("That factorial is too large to display.");
  let answer = 1;
  for (let n = 2; n <= value; n += 1) answer *= n;
  return answer;
}

function checked(value) {
  if (!Number.isFinite(value)) throw new Error("That result isn't a real, finite number.");
  return value;
}

function calculate(source) {
  const postfix = toPostfix(tokenize(source));
  const stack = [];
  for (const token of postfix) {
    if (token.type === "number") { stack.push(token.value); continue; }
    if (token.type === "postfix") {
      if (!stack.length) throw new Error("That expression is missing a value.");
      const value = stack.pop();
      stack.push(checked(token.value === "!" ? factorial(value) : value / 100));
      continue;
    }
    if (token.type === "function") {
      if (!stack.length) throw new Error("That function needs a value.");
      const value = stack.pop();
      const radians = angleMode === "DEG" ? value * Math.PI / 180 : value;
      let answer;
      switch (token.value) {
        case "sin": answer = Math.sin(radians); break;
        case "cos": answer = Math.cos(radians); break;
        case "tan":
          if (Math.abs(Math.cos(radians)) < 1e-12) throw new Error("Tangent is undefined at this angle.");
          answer = Math.tan(radians); break;
        case "asin": case "acos": case "atan":
          if (token.value === "asin" && (value < -1 || value > 1)) throw new Error("sin⁻¹ only accepts values from −1 to 1.");
          if (token.value === "acos" && (value < -1 || value > 1)) throw new Error("cos⁻¹ only accepts values from −1 to 1.");
          answer = token.value === "asin" ? Math.asin(value) : token.value === "acos" ? Math.acos(value) : Math.atan(value);
          if (angleMode === "DEG") answer *= 180 / Math.PI;
          break;
        case "log":
          if (value <= 0) throw new Error("log needs a value greater than zero.");
          answer = Math.log10(value); break;
        case "ln":
          if (value <= 0) throw new Error("ln needs a value greater than zero.");
          answer = Math.log(value); break;
        case "sqrt":
          if (value < 0) throw new Error("A real square root needs a non-negative value.");
          answer = Math.sqrt(value); break;
        case "recip":
          if (value === 0) throw new Error("You can't divide by zero.");
          answer = 1 / value; break;
        default: throw new Error("That function isn't available.");
      }
      stack.push(checked(answer));
      continue;
    }
    if (token.type === "operator") {
      if (token.value === "u+" || token.value === "u-") {
        if (!stack.length) throw new Error("That sign needs a value.");
        stack.push(checked(token.value === "u-" ? -stack.pop() : stack.pop()));
        continue;
      }
      if (stack.length < 2) throw new Error("That operation needs two values.");
      const right = stack.pop();
      const left = stack.pop();
      let answer;
      switch (token.value) {
        case "+": answer = left + right; break;
        case "-": answer = left - right; break;
        case "×": answer = left * right; break;
        case "÷":
          if (right === 0) throw new Error("You can't divide by zero.");
          answer = left / right; break;
        case "^": answer = left ** right; break;
        default: throw new Error("That operation isn't available.");
      }
      stack.push(checked(answer));
    }
  }
  if (stack.length !== 1) throw new Error("Check the order of your expression.");
  return stack[0];
}

function formatNumber(number) {
  if (Object.is(number, -0) || Math.abs(number) < 1e-14) number = 0;
  return Number(number.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 10, useGrouping: false });
}

function prettify(source) {
  return source.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
}

function refreshDisplay() {
  expressionDisplay.textContent = expression ? prettify(expression) : "0";
  display.classList.remove("error");
  if (!expression) {
    resultDisplay.textContent = "0";
    hint.innerHTML = 'Ready when you are <span aria-hidden="true">✧</span>';
    return;
  }
  try {
    resultDisplay.textContent = formatNumber(calculate(expression));
    hint.innerHTML = 'Looking good <span aria-hidden="true">✧</span>';
  } catch (error) {
    resultDisplay.textContent = "· · ·";
    hint.textContent = error.message;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1900);
}

function playClick() {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .065);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .07);
  } catch (error) {
    console.warn("Button sound could not be played.", error);
  }
}

function insertValue(value) {
  if (resultDisplay.dataset.completed === "true" && /^[\dπe.(]/.test(value)) expression = "";
  resultDisplay.dataset.completed = "false";
  expression += value;
  refreshDisplay();
}

function runFunction(name) {
  if (resultDisplay.dataset.completed === "true") resultDisplay.dataset.completed = "false";
  if (name === "sqrt") expression += "sqrt(";
  else if (name === "recip") expression = expression ? `recip(${expression})` : "recip(";
  else expression += `${name}(`;
  refreshDisplay();
}

function toggleSign() {
  if (!expression) { expression = "-"; refreshDisplay(); return; }
  if (resultDisplay.dataset.completed === "true") {
    expression = `-(${expression})`;
    resultDisplay.dataset.completed = "false";
    refreshDisplay();
    return;
  }
  const match = expression.match(/(\d+(?:\.\d*)?|\.\d+|π|e)$/);
  if (!match) { expression += "-"; }
  else {
    const start = match.index;
    const preceding = expression.slice(0, start);
    if (preceding.endsWith("(-")) expression = preceding.slice(0, -2) + match[0];
    else if (!preceding || /[+\-×÷^(]$/.test(preceding)) expression = preceding + "-" + match[0];
    else expression = preceding + "(-" + match[0] + ")";
  }
  refreshDisplay();
}

function renderHistory() {
  if (!history.length) {
    historyList.innerHTML = '<div class="history-empty"><span>🌸</span><p>Your calculations will<br>appear here.</p></div>';
    return;
  }
  historyList.replaceChildren(...history.map((item, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "history-item";
    row.setAttribute("aria-label", `Reuse ${item.expression} equals ${item.answer}`);
    row.dataset.index = String(index);
    const expressionText = document.createElement("span");
    expressionText.className = "history-expression";
    expressionText.textContent = prettify(item.expression);
    const answerText = document.createElement("span");
    answerText.className = "history-answer";
    answerText.textContent = `= ${item.answer}`;
    row.append(expressionText, answerText);
    return row;
  }));
}

function calculateAndSave() {
  if (!expression) return;
  try {
    const answer = calculate(expression);
    const formatted = formatNumber(answer);
    history.unshift({ expression, answer: formatted });
    if (history.length > 12) history.pop();
    renderHistory();
    lastAnswer = answer;
    expressionDisplay.textContent = prettify(expression);
    resultDisplay.textContent = formatted;
    resultDisplay.dataset.completed = "true";
    hint.innerHTML = 'A little math magic <span aria-hidden="true">✿</span>';
    display.classList.remove("error", "pop");
    void display.offsetWidth;
    display.classList.add("pop");
    blossomBurst();
  } catch (error) {
    display.classList.add("error");
    resultDisplay.textContent = "Oops!";
    hint.textContent = error.message;
  }
}

function blossomBurst() {
  const layer = document.querySelector(".petal-layer");
  for (let i = 0; i < 9; i += 1) {
    const petal = document.createElement("span");
    petal.className = "petal burst-petal";
    petal.style.left = `${42 + Math.random() * 16}%`;
    petal.style.top = "48%";
    petal.style.animationDuration = `${1.2 + Math.random() * .8}s`;
    layer.append(petal);
    window.setTimeout(() => petal.remove(), 2200);
  }
}

document.querySelectorAll(".key").forEach((button) => {
  button.addEventListener("click", () => {
    playClick();
    if (button.dataset.insert !== undefined) insertValue(button.dataset.insert);
    else if (button.dataset.function) runFunction(button.dataset.function);
    else if (button.dataset.action === "clear") {
      expression = "";
      resultDisplay.dataset.completed = "false";
      display.classList.remove("error");
      display.classList.remove("pop");
      refreshDisplay();
      display.animate([{ transform: "scale(1)" }, { transform: "scale(1.015)" }, { transform: "scale(1)" }], { duration: 280 });
      showToast("All clear, little star! ✨");
    } else if (button.dataset.action === "delete") {
      expression = expression.slice(0, -1);
      resultDisplay.dataset.completed = "false";
      refreshDisplay();
    } else if (button.dataset.action === "equals") calculateAndSave();
    else if (button.dataset.action === "angle") {
      angleMode = angleMode === "DEG" ? "RAD" : "DEG";
      angleLabel.textContent = angleMode;
      angleButton.textContent = angleMode;
      refreshDisplay();
      showToast(`Angle mode: ${angleMode} ✧`);
    } else if (button.dataset.action === "sign") toggleSign();
  });
});

document.getElementById("historyToggle").addEventListener("click", () => {
  const panel = document.getElementById("historyPanel");
  const expanded = document.getElementById("historyToggle").getAttribute("aria-expanded") === "true";
  document.getElementById("historyToggle").setAttribute("aria-expanded", String(!expanded));
  panel.classList.toggle("history-highlight");
  if (window.matchMedia("(max-width: 850px)").matches) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.getElementById("clearHistory").addEventListener("click", () => {
  history.length = 0;
  renderHistory();
  showToast("Your notebook is fresh again 🌸");
});

historyList.addEventListener("click", (event) => {
  const row = event.target.closest(".history-item");
  if (!row) return;
  expression = history[Number(row.dataset.index)].expression;
  resultDisplay.dataset.completed = "false";
  refreshDisplay();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("themeToggle").addEventListener("click", (event) => {
  document.body.classList.toggle("light-mode");
  const light = document.body.classList.contains("light-mode");
  event.currentTarget.textContent = light ? "☾" : "☼";
  event.currentTarget.setAttribute("aria-label", light ? "Switch to dark appearance" : "Switch to light appearance");
  showToast(light ? "A softer little daytime ✿" : "Back to the dreamy night ☾");
});

document.getElementById("soundToggle").addEventListener("click", (event) => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = soundEnabled ? "♫" : "♪";
  event.currentTarget.setAttribute("aria-label", soundEnabled ? "Turn button sounds off" : "Turn button sounds on");
  showToast(soundEnabled ? "Soft sounds are on ♫" : "Quiet mode is on");
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (/^\d$/.test(key) || key === ".") insertValue(key);
  else if (key === "+") insertValue("+");
  else if (key === "-") insertValue("-");
  else if (key === "*") insertValue("×");
  else if (key === "/") { event.preventDefault(); insertValue("÷"); }
  else if (key === "^" || key === "(" || key === ")" || key === "%") insertValue(key);
  else if (key === "!") insertValue("!");
  else if (key === "Enter" || key === "=") { event.preventDefault(); calculateAndSave(); }
  else if (key === "Backspace") {
    expression = expression.slice(0, -1);
    resultDisplay.dataset.completed = "false";
    refreshDisplay();
  } else if (key === "Escape" || key.toLowerCase() === "c") {
    expression = "";
    resultDisplay.dataset.completed = "false";
    refreshDisplay();
  }
});

function createGardenDetails() {
  const layer = document.querySelector(".petal-layer");
  for (let i = 0; i < 18; i += 1) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.animationDuration = `${9 + Math.random() * 13}s`;
    petal.style.animationDelay = `${-Math.random() * 20}s`;
    petal.style.opacity = `${.25 + Math.random() * .42}`;
    layer.append(petal);
  }
}

createGardenDetails();
renderHistory();
refreshDisplay();
window.addEventListener("load", () => {
  window.setTimeout(() => document.getElementById("loadingScreen").classList.add("hidden"), 450);
});
