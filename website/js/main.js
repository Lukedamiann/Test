// =========================================================
// Theme toggle (persisted in localStorage)
// =========================================================
const THEME_KEY = "portfolio-theme";
const themeToggle = document.getElementById("theme-toggle");
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeToggle.querySelector("span").textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

initTheme();

// =========================================================
// Mobile nav toggle
// =========================================================
const navToggle = document.getElementById("nav-toggle");
const nav = document.getElementById("primary-nav");

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

// Close mobile nav after clicking a link
nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

// =========================================================
// Scroll-reveal animations
// =========================================================
const revealEls = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => observer.observe(el));
} else {
  // Fallback: just show everything
  revealEls.forEach((el) => el.classList.add("in-view"));
}

// =========================================================
// Rotating role text in hero (EDIT: change the words below)
// =========================================================
const roles = ["Developer.", "Builder.", "Problem solver.", "Learner."];
const typedEl = document.getElementById("typed-role");
let roleIndex = 0;

if (typedEl) {
  setInterval(() => {
    roleIndex = (roleIndex + 1) % roles.length;
    typedEl.textContent = roles[roleIndex];
  }, 2200);
}

// =========================================================
// Footer year
// =========================================================
document.getElementById("year").textContent = new Date().getFullYear();

// =========================================================
// Contact form (front-end only demo — see README for wiring
// this up to a real backend/service like Formspree)
// =========================================================
const form = document.getElementById("contact-form");
const formNote = document.getElementById("form-note");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  formNote.textContent = "Thanks! This form is a demo — see the README to wire it up to a real email service.";
  form.reset();
});
