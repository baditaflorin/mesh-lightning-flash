import { expect, test, type Page } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer assertion for the advertised core action:
 *
 *   "Tap FLASH on the camera and every lamp strobes simultaneously."
 *
 * The advertised wire payload is a `{ fireAt, cycleId }` event pushed into a
 * shared `Y.Array("fires")`; every lamp schedules its strobe relative to its
 * own mesh clock so they all converge on the same instant. The torch LED is
 * genuinely undrivable headless (and not exposed on iOS Safari at all — see
 * README "Honest caveats about torch sync"), so we drive the always-available
 * SCREEN-flash fallback: the full-white `.flash-overlay.on` overlay that every
 * lamp flips on at `fireAt` regardless of torch support.
 *
 * Peer A is the CAMERA, peer B is a LAMP. The test proves the FLASH trigger on
 * A actually crosses the mesh and strobes B's screen — i.e. peer B sees the
 * result of peer A's advertised action. It is wired to FAIL if the camera's
 * FLASH never writes the fire event, or the lamp never observes/schedules it.
 */

async function setRoleAndArm(page: Page, role: "camera" | "lamp"): Promise<void> {
  // Pick the role straight from the arm screen's one-tap toggle (the primary
  // UX path — no Settings hunt), then arm to create the Yjs mesh room. This
  // also exercises that the toggle actually flips the role before arming.
  await page.getByRole("button", { name: role === "camera" ? /📷 camera/ : /🔦 lamp/ }).click();
  await page.getByRole("button", { name: role === "camera" ? /Arm camera/i : /Arm lamp/i }).click();
}

test("camera FLASH strobes the lamp on the opposite peer", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // A = camera, B = lamp. Arm both so each creates its Yjs room + clock sync.
    await setRoleAndArm(a, "camera");
    await setRoleAndArm(b, "lamp");

    // Camera shows its FLASH trigger; lamp is armed and waiting.
    const flashButton = a.getByRole("button", { name: /^FLASH$/ });
    await expect(flashButton).toBeVisible();

    // The lamp's strobe overlay must NOT be on before the camera fires.
    const lampOverlay = b.locator(".flash-overlay");
    await expect(lampOverlay).not.toHaveClass(/(^|\s)on(\s|$)/);

    // The strobe is brief (flashMs default 180ms), so a poll could miss the
    // window. Install a MutationObserver on the lamp BEFORE firing that latches
    // the moment `.flash-overlay` ever gains the `on` class.
    await b.evaluate(() => {
      const w = window as unknown as { __strobed?: boolean };
      w.__strobed = false;
      const el = document.querySelector(".flash-overlay");
      if (!el) return;
      const check = () => {
        if (el.classList.contains("on")) w.__strobed = true;
      };
      check();
      new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ["class"] });
    });

    // Drive the advertised core action on peer A.
    await flashButton.click();

    // OPPOSITE-PEER assertion: the lamp's screen strobed white because it
    // observed the shared `fires` event over the mesh and scheduled its own
    // strobe relative to its mesh clock. The latch proves the camera's FLASH
    // crossed the mesh and reached peer B.
    await expect
      .poll(() => b.evaluate(() => (window as unknown as { __strobed?: boolean }).__strobed), {
        timeout: 8_000,
        intervals: [50, 50, 100, 100, 200],
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});

/**
 * The lamp shows a live "Firing in N s…" countdown the moment the camera's
 * FLASH event arrives over the mesh — proving the shared `fireAt` instant
 * crossed the wire AND that the countdown is rendered (previously it read off
 * the raw local wall clock, was offset by the peer's clock skew, and never
 * ticked). We use a long countdown (4 s) so the indicator is reliably visible
 * before the strobe consumes the event.
 */
test("the lamp surfaces a live countdown when the camera arms a flash", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Give the camera a long, obvious countdown so the lamp's indicator is
    // observable before the strobe fires.
    await a.evaluate(
      (prefix) => localStorage.setItem(`${prefix}:countdown`, "4000"),
      storagePrefix,
    );
    await a.reload();

    await setRoleAndArm(a, "camera");
    await setRoleAndArm(b, "lamp");

    // No countdown on the lamp before the camera fires.
    await expect(b.getByText(/Firing in/i)).toHaveCount(0);

    await a.getByRole("button", { name: /^FLASH$/ }).click();

    // OPPOSITE-PEER assertion: the lamp renders the live countdown sourced from
    // the camera's mesh-time `fireAt`, naming a sub-4s remaining time.
    const countdown = b.getByText(/Firing in [0-3](\.\d)? s/i);
    await expect(countdown).toBeVisible({ timeout: 8_000 });
  } finally {
    await cleanup();
  }
});

/**
 * Regression test for a stuck-disabled FLASH button.
 *
 * The camera's FLASH button is disabled while a `fires` event is "live"
 * (`pendingFire !== null`). `pendingFire` used to only get recomputed inside
 * the `fires.observe` callback, which only fires on an actual Y.Array
 * mutation. A fire event's 500ms grace window expires on its own — nothing
 * else mutates the array at that moment for a normal session (the
 * trim-to-10 delete only runs once the array exceeds 20 entries) — so
 * `pendingFire` was never recomputed afterwards and the FLASH button stayed
 * disabled forever after the very first flash of a session, permanently
 * breaking the app's core action. This asserts the button becomes usable
 * again well after the fire's countdown + flash + grace window elapses, and
 * that a second FLASH actually re-fires the lamp.
 */
test("camera FLASH button re-enables after a flash completes, and can fire again", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Short countdown + flash duration so the whole cycle (countdown + flash
    // + 500ms grace) resolves quickly and predictably in the test.
    await a.evaluate((prefix) => {
      localStorage.setItem(`${prefix}:countdown`, "500");
      localStorage.setItem(`${prefix}:flashMs`, "50");
    }, storagePrefix);
    await a.reload();

    await setRoleAndArm(a, "camera");
    await setRoleAndArm(b, "lamp");

    const flashButton = a.getByRole("button", { name: /^FLASH$|^Firing…$/ });
    await flashButton.click();
    await expect(flashButton).toBeDisabled();

    // Full cycle is ~500ms countdown + 50ms flash + 500ms grace ≈ 1050ms.
    // Give real headroom above that; a stuck button would still be disabled
    // at 3s.
    await expect(flashButton).toBeEnabled({ timeout: 3_000 });
    await expect(flashButton).toHaveText("FLASH");

    // Prove it isn't just the label resetting: firing a second time must
    // still reach the opposite peer.
    await b.evaluate(() => {
      const w = window as unknown as { __strobed2?: boolean };
      w.__strobed2 = false;
      const el = document.querySelector(".flash-overlay");
      if (!el) return;
      const check = () => {
        if (el.classList.contains("on")) w.__strobed2 = true;
      };
      new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ["class"] });
    });

    await flashButton.click();

    await expect
      .poll(() => b.evaluate(() => (window as unknown as { __strobed2?: boolean }).__strobed2), {
        timeout: 8_000,
        intervals: [50, 50, 100, 100, 200],
      })
      .toBe(true);
  } finally {
    await cleanup();
  }
});
