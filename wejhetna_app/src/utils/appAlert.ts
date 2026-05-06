import { useSyncExternalStore } from "react";

/**
 * App-wide `Alert.alert` replacement: same call patterns, but rendered in a
 * styled modal that matches the app design system (see `AppDialogHost`).
 */
export type AppAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

export type AppAlertOptions = {
  /** Android: backdrop / hardware back. Default `true` (matches common RN use). */
  cancelable?: boolean;
  onDismiss?: () => void;
};

type DialogItem = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
};

let queue: DialogItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function isOptions(x: unknown): x is AppAlertOptions {
  if (x == null || Array.isArray(x) || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if ("text" in o && typeof o.text === "string" && "onPress" in o) return false;
  if ("cancelable" in o || "onDismiss" in o) return true;
  return Object.keys(o).length === 0;
}

function defaultButtons(): AppAlertButton[] {
  return [{ text: "OK", style: "default" }];
}

function normalizeButtons(input?: AppAlertButton[] | null): AppAlertButton[] {
  if (input && input.length > 0) return input;
  return defaultButtons();
}

function pushDialog(item: DialogItem) {
  queue = [...queue, item];
  emit();
}

/**
 * Dismiss the current dialog and show the next in queue, if any.
 * Usually called from the host after a button is pressed; exported for tests.
 */
export function popAppDialog() {
  if (queue.length === 0) return;
  queue = queue.slice(1);
  emit();
}

function mergeOptions(
  a?: AppAlertOptions,
  b?: AppAlertOptions
): AppAlertOptions | undefined {
  if (!a && !b) return undefined;
  return { ...a, ...b };
}

/**
 * Drop-in for `import { Alert } from "react-native"; Alert.alert(...)`.
 * Supports: `appAlert(title)`, `appAlert(title, message)`,
 * `appAlert(title, message, buttons)`, `appAlert(title, message, buttons, options)`,
 * and `appAlert(title, buttons)`.
 */
export function appAlert(
  title: string,
  messageOrButtons?: string | AppAlertButton[],
  buttonsOrOptions?: AppAlertButton[] | AppAlertOptions,
  options?: AppAlertOptions
): void {
  if (Array.isArray(messageOrButtons)) {
    const buttons = normalizeButtons(messageOrButtons);
    const opt =
      isOptions(buttonsOrOptions) && !Array.isArray(buttonsOrOptions)
        ? (buttonsOrOptions as AppAlertOptions)
        : options;
    pushDialog({
      title,
      message: undefined,
      buttons,
      options: mergeOptions(
        opt,
        isOptions(buttonsOrOptions) ? undefined : (options as AppAlertOptions)
      ),
    });
    return;
  }

  const message = messageOrButtons;
  if (buttonsOrOptions === undefined) {
    pushDialog({ title, message, buttons: defaultButtons(), options });
    return;
  }
  if (Array.isArray(buttonsOrOptions)) {
    pushDialog({
      title,
      message,
      buttons: normalizeButtons(buttonsOrOptions),
      options,
    });
    return;
  }
  if (isOptions(buttonsOrOptions)) {
    pushDialog({
      title,
      message,
      buttons: defaultButtons(),
      options: mergeOptions(buttonsOrOptions, options),
    });
    return;
  }

  pushDialog({ title, message, buttons: defaultButtons(), options });
}

export function useAppDialogQueue() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => queue,
    () => queue
  );
}

export type AppDialogQueueItem = (typeof queue)[number];
