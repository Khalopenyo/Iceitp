import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

/* ===== Scroll-reveal IntersectionObserver ===== */
const revealSelectors = ".reveal, .reveal-left, .reveal-right, .reveal-scale";

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
);

const observeAll = () => {
  document.querySelectorAll(revealSelectors).forEach((el) => {
    if (!el.classList.contains("visible")) {
      revealObserver.observe(el);
    }
  });
};

/* Observe on initial load + watch for SPA navigation */
observeAll();
new MutationObserver(() => requestAnimationFrame(observeAll)).observe(
  document.getElementById("root"),
  { childList: true, subtree: true }
);

/* ===== Smooth parallax tilt on hero stage (mouse-follow) ===== */
document.addEventListener("mousemove", (e) => {
  const hero = document.querySelector(".hero-stage");
  if (!hero) return;
  const rect = hero.getBoundingClientRect();
  if (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  )
    return;
  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  hero.style.transform = `perspective(1200px) rotateY(${x * 1.2}deg) rotateX(${-y * 1.2}deg)`;
  hero.style.transition = "transform 0.1s ease-out";
});

document.addEventListener("mouseleave", () => {
  const hero = document.querySelector(".hero-stage");
  if (hero) {
    hero.style.transform = "";
    hero.style.transition = "transform 0.6s ease-out";
  }
});
