import { WebHaptics, defaultPatterns } from "web-haptics";

let instance: WebHaptics | null = null;

function getHaptics(): WebHaptics {
  if (!instance) instance = new WebHaptics();
  return instance;
}

export function hapticSuccess() {
  getHaptics().trigger(defaultPatterns.success);
}

export function hapticError() {
  getHaptics().trigger(defaultPatterns.error);
}
