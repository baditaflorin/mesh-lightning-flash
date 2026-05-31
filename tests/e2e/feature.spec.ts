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
  // Role is read from localStorage at mount; set it then reload so the
  // component picks it up, then arm to create the Yjs mesh room.
  await page.evaluate(({ prefix, r }) => localStorage.setItem(`${prefix}:role`, r), {
    prefix: storagePrefix,
    r: role,
  });
  await page.reload();
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
