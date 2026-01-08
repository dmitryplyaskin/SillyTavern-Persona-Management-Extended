/**
 * Small DOM helpers for PME UI.
 * Keep them framework-free and stable so components stay simple.
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string=} className
 * @param {string=} text
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return /** @type {HTMLElementTagNameMap[K]} */ (node);
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 */
export function qs(root, selector) {
  return root.querySelector(selector);
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 */
export function qsa(root, selector) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * @param {Element} node
 * @param {boolean} hidden
 */
export function setHidden(node, hidden) {
  node.classList.toggle("displayNone", hidden);
}

