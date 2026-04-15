/**
 * In-memory location prompt state per authenticated session.
 * Resets on logout so the next login triggers the login-time permission ask again.
 */

let activeSessionId = 0;
/** Last session id for which we already ran the one-time prompt after entering tabs */
let loginLocationPromptCompletedForSessionId = 0;

/** Call when the user successfully logs in (before navigating to UserTabs / AdminTabs). */
export function notifyUserLoggedIn(): void {
  activeSessionId += 1;
}

/** Call when the user logs out (before or after clearing storage). */
export function notifyUserLoggedOut(): void {
  activeSessionId = 0;
  loginLocationPromptCompletedForSessionId = 0;
}

export function getActiveLocationSessionId(): number {
  return activeSessionId;
}

/** True once per login session until the tab navigator runs the initial permission request. */
export function shouldRunLoginLocationPrompt(): boolean {
  return (
    activeSessionId > 0 && loginLocationPromptCompletedForSessionId < activeSessionId
  );
}

/** Mark the login-time prompt as done for the current session (call when starting the prompt). */
export function markLoginLocationPromptStarted(): void {
  loginLocationPromptCompletedForSessionId = activeSessionId;
}
