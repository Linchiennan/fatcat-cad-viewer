/** Android and iPhone/iPad browsers and web views ignore webkitdirectory (a folder can only be entered, not picked);
 *  desktop browsers support it. */
export const cannotPickFolder = (): boolean => {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(nav.userAgent)
    || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1); // iPadOS reports a Mac
};
