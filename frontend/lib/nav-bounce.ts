/** Bounce-анимация на нажатие — Web Animations API,
    чтобы эффект срабатывал с первого клика (до навигации). */
export function bouncePress(el: HTMLElement) {
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.85)" },
      { transform: "scale(1.1)" },
      { transform: "scale(1)" },
    ],
    { duration: 350, easing: "ease", fill: "none" },
  );
}

/** @deprecated use bouncePress */
export const bounceNavItem = bouncePress;
