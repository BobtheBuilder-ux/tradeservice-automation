const puppeteer = require('puppeteer');

async function testLoginFlow() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    
    // Wait for the page to load
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    
    console.log('Filling login form...');
    await page.type('input[name="email"]', 'luckisstarspiff@gmail.com');
    await page.type('input[name="password"]', 'AdminPass123!');
    
    console.log('Submitting login form...');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation({ timeout: 10000 });
    
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);
    
    if (currentUrl.includes('/admin-dashboard')) {
      console.log('✅ Successfully navigated to admin dashboard');
    } else {
      console.log('❌ Failed to navigate to admin dashboard');
    }
    
  } catch (error) {
    console.error('Error during test:', error.message);
  } finally {
    await browser.close();
  }
}

testLoginFlow();