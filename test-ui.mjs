import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testOurPlaceApp() {
  console.log("Starting browser...");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Slow down actions for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate to landing page
    console.log("\n1. Navigating to landing page...");
    await page.goto("http://localhost:3000");
    await delay(1000);
    await page.screenshot({ path: "screenshots/01-landing-page.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 01-landing-page.png");

    // Step 2: Navigate to register page and register
    console.log("\n2. Navigating to registration page...");
    await page.goto("http://localhost:3000/auth/register", { waitUntil: "networkidle" });
    await delay(1000);

    console.log("   Filling registration form...");
    // Use placeholder text to find inputs since they don't have name attributes
    await page.fill('input[placeholder="Your full name"]', "Test User");
    await page.fill('input[placeholder="username"]', "testuser");
    await page.fill('input[placeholder="you@example.com"]', "test@example.com");
    await page.fill('input[placeholder="(555) 123-4567"]', "1234567890");
    await page.fill('input[placeholder="At least 8 characters"]', "Test1234!");
    await page.fill('input[placeholder="Confirm your password"]', "Test1234!");
    await delay(500);

    console.log("   Clicking register button...");
    await page.click('button[type="submit"]');
    await delay(3000);
    await page.screenshot({ path: "screenshots/02-after-registration.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 02-after-registration.png");

    // Step 3: Navigate to communities page
    console.log("\n3. Navigating to communities page...");
    await page.goto("http://localhost:3000/communities", { waitUntil: "networkidle" });
    await delay(2000);
    await page.screenshot({ path: "screenshots/03-communities-list.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 03-communities-list.png");

    // Step 4: Click on Welcome Center community
    console.log("\n4. Clicking on Welcome Center community...");
    const welcomeCenterLink = page.locator("text=Welcome Center").first();
    await welcomeCenterLink.click();
    await delay(2000);
    await page.screenshot({ path: "screenshots/04-welcome-center.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 04-welcome-center.png");

    // Step 5: Join community if needed and open post form
    console.log("\n5. Checking for Join Community button...");
    const joinButton = page.locator('button:has-text("Join Community")');
    const joinButtonVisible = await joinButton.isVisible().catch(() => false);

    if (joinButtonVisible) {
      console.log("   Clicking Join Community button...");
      await joinButton.click();
      await delay(2000);
    } else {
      console.log("   Already a member or button not found");
    }

    console.log('   Clicking "Share something with the community..." button...');
    const shareButton = page
      .locator("text=Share something with the community...")
      .or(page.locator('textarea[placeholder*="Share"]'));
    await shareButton.click();
    await delay(1500);
    await page.screenshot({ path: "screenshots/05-post-form-opened.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 05-post-form-opened.png");

    // Step 6: Click through Photo, Video, and Rich tabs
    console.log("\n6. Testing post creation tabs...");

    // Photo tab
    console.log("   Clicking Photo tab...");
    const photoTab = page.locator('button:has-text("Photo")');
    await photoTab.click();
    await delay(1000);
    await page.screenshot({ path: "screenshots/06-photo-tab.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 06-photo-tab.png");

    // Video tab
    console.log("   Clicking Video tab...");
    const videoTab = page.locator('button:has-text("Video")');
    await videoTab.click();
    await delay(1000);
    await page.screenshot({ path: "screenshots/07-video-tab.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 07-video-tab.png");

    // Rich tab
    console.log("   Clicking Rich tab...");
    const richTab = page.locator('button:has-text("Rich")');
    await richTab.click();
    await delay(1000);
    await page.screenshot({ path: "screenshots/08-rich-tab.png", fullPage: true });
    console.log("   ✓ Screenshot saved: 08-rich-tab.png");

    console.log("\n✅ All tests completed successfully!");
    console.log("📸 Screenshots saved in ./screenshots/ directory");
  } catch (error) {
    console.error("\n❌ Error during testing:", error.message);
    await page.screenshot({ path: "screenshots/error.png", fullPage: true });
    console.log("   Error screenshot saved: error.png");
  } finally {
    await delay(2000);
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
