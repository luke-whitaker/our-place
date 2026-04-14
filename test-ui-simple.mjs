import { chromium } from "playwright";

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testOurPlaceApp() {
  console.log("Starting browser...");
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Step 1: Landing page
    console.log("\n📸 Step 1: Landing page");
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await delay(2000);
    await page.screenshot({ path: "screenshots/01-landing-page.png", fullPage: true });
    console.log("   ✓ Saved: 01-landing-page.png");

    // Step 2: Registration page
    console.log("\n📸 Step 2: Registration page");
    await page.goto("http://localhost:3000/auth/register", { waitUntil: "domcontentloaded" });
    await delay(2000);
    await page.screenshot({ path: "screenshots/02-register-page.png", fullPage: true });
    console.log("   ✓ Saved: 02-register-page.png");

    // Try to fill the form
    console.log("\n   Attempting to fill registration form...");
    try {
      const inputs = await page.$$("input");
      console.log(`   Found ${inputs.length} input fields`);

      // Fill by index
      if (inputs.length >= 6) {
        await inputs[0].fill("Test User");
        await inputs[1].fill("testuser");
        await inputs[2].fill("test@example.com");
        await inputs[3].fill("1234567890");
        await inputs[4].fill("Test1234!");
        await inputs[5].fill("Test1234!");
        await delay(1000);

        console.log("   Form filled, clicking submit...");
        await page.click('button[type="submit"]');
        await delay(3000);

        await page.screenshot({ path: "screenshots/03-after-submit.png", fullPage: true });
        console.log("   ✓ Saved: 03-after-submit.png");
      }
    } catch (err) {
      console.log(`   ⚠️  Could not fill form: ${err.message}`);
    }

    // Step 3: Communities page
    console.log("\n📸 Step 3: Communities page");
    await page.goto("http://localhost:3000/communities", { waitUntil: "domcontentloaded" });
    await delay(3000);
    await page.screenshot({ path: "screenshots/04-communities-list.png", fullPage: true });
    console.log("   ✓ Saved: 04-communities-list.png");

    // Step 4: Click Welcome Center
    console.log("\n📸 Step 4: Welcome Center community");
    try {
      const welcomeLink = await page.locator("text=Welcome Center").first();
      await welcomeLink.click();
      await delay(3000);
      await page.screenshot({ path: "screenshots/05-welcome-center.png", fullPage: true });
      console.log("   ✓ Saved: 05-welcome-center.png");

      // Try to join if button exists
      const joinBtn = page.locator('button:has-text("Join")');
      const isVisible = await joinBtn.isVisible().catch(() => false);
      if (isVisible) {
        console.log("   Clicking Join button...");
        await joinBtn.click();
        await delay(2000);
      }

      // Step 5: Open post form
      console.log("\n📸 Step 5: Opening post creation form");
      const shareBtn = page.locator("textarea").or(page.locator("text=Share something"));
      await shareBtn.click();
      await delay(2000);
      await page.screenshot({ path: "screenshots/06-post-form-opened.png", fullPage: true });
      console.log("   ✓ Saved: 06-post-form-opened.png");

      // Step 6: Test tabs
      console.log("\n📸 Step 6: Testing post creation tabs");

      // Photo tab
      const photoTab = page.locator('button:has-text("Photo")');
      if (await photoTab.isVisible().catch(() => false)) {
        await photoTab.click();
        await delay(1500);
        await page.screenshot({ path: "screenshots/07-photo-tab.png", fullPage: true });
        console.log("   ✓ Saved: 07-photo-tab.png");
      }

      // Video tab
      const videoTab = page.locator('button:has-text("Video")');
      if (await videoTab.isVisible().catch(() => false)) {
        await videoTab.click();
        await delay(1500);
        await page.screenshot({ path: "screenshots/08-video-tab.png", fullPage: true });
        console.log("   ✓ Saved: 08-video-tab.png");
      }

      // Rich tab
      const richTab = page.locator('button:has-text("Rich")');
      if (await richTab.isVisible().catch(() => false)) {
        await richTab.click();
        await delay(1500);
        await page.screenshot({ path: "screenshots/09-rich-tab.png", fullPage: true });
        console.log("   ✓ Saved: 09-rich-tab.png");
      }

      // Text tab (go back)
      const textTab = page.locator('button:has-text("Text")');
      if (await textTab.isVisible().catch(() => false)) {
        await textTab.click();
        await delay(1500);
        await page.screenshot({ path: "screenshots/10-text-tab.png", fullPage: true });
        console.log("   ✓ Saved: 10-text-tab.png");
      }
    } catch (err) {
      console.log(`   ⚠️  Error in community navigation: ${err.message}`);
      await page.screenshot({ path: "screenshots/error-community.png", fullPage: true });
    }

    console.log("\n✅ Testing complete! Check the screenshots/ directory.");
  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    await page.screenshot({ path: "screenshots/error-fatal.png", fullPage: true });
  } finally {
    await delay(3000);
    await browser.close();
  }
}

// Create screenshots directory
import { mkdirSync } from "fs";
try {
  mkdirSync("screenshots", { recursive: true });
} catch (err) {
  // Directory already exists
}

testOurPlaceApp();
