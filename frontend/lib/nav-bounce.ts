/** Bounce-анимация для пунктов меню — Web Animations API,
    чтобы эффект срабатывал с первого нажатия (до навигации). */
export function bounceNavItem(el: HTMLElement) {
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
