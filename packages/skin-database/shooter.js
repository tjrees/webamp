const path = require("path");
const puppeteer = require("puppeteer");
const imagemin = require("imagemin");
const imageminOptipng = require("imagemin-optipng");

function min(imgPath) {
  return imagemin([imgPath], path.dirname(imgPath), {
    use: [imageminOptipng()],
  });
}

class Shooter {
  constructor(url) {
    this._initialized = false;
    this._url = url;
  }

  static async withShooter(cb) {
    const shooter = new Shooter("https://webamp.org");
    try {
      await cb(shooter);
    } finally {
      shooter.dispose();
    }
  }

  async init() {
    this._browser = await puppeteer.launch();
    this._page = await this._browser.newPage();
    this._page.setViewport({ width: 275, height: 116 * 3 });
    this._page.on("console", (consoleMessage) => {
      if (
        consoleMessage.text() ===
        "The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://goo.gl/7K7WLu"
      ) {
        return;
      }

      console.log("page log:", consoleMessage);
    });
    this._page.on("error", (e) => {
      console.log(`Page error: ${e.toString()}`);
    });

    const url = `${this._url}/?screenshot=1`;
    await this._page.goto(url);
    await this._page.waitForSelector("#main-window", { timeout: 2000 });
    await this._page.evaluate(() => {
      // Needed to allow for transparent screenshots
      window.document.body.style.background = "none";
    });
    this._initialized = true;
  }

  async _ensureInitialized() {
    if (!this._initialized) {
      await this.init();
    }
  }

  async takeScreenshot(skin, screenshotPath, { minify = false }) {
    console.log("start!", this._page);
    await this._ensureInitialized();
    console.log("Going to try", screenshotPath, skin);
    try {
      console.log("geting input");
      const handle = await this._page.$("#webamp-file-input");
      console.log("uploading skin");

      await new Promise(async (resolve, reject) => {
        console.log("start promise");
        const dialogHandler = (dialog) => {
          reject(dialog.message());
        };
        this._page.on("dialog", dialogHandler);
        await handle.uploadFile(skin);
        console.log("waiting for skin to load...");
        await this._page.evaluate(() => {
          return window.__webamp.skinIsLoaded();
        });
        console.log("waiting for screenshot");
        await this._page.screenshot({
          path: screenshotPath,
          omitBackground: true, // Make screenshot transparent
          // https://github.com/GoogleChrome/puppeteer/issues/703#issuecomment-366041479
          clip: { x: 0, y: 0, width: 275, height: 116 * 3 },
        });

        this._page.off("dialog", dialogHandler);

        resolve();
      });

      console.log("Wrote screenshot to", screenshotPath);
      if (minify) {
        min(screenshotPath);
      }
      console.log("Minified", screenshotPath);
    } catch (e) {
      console.error("Something went wrong, restarting browser", e);
      await this.dispose();
      await this.init();
      throw e;
    }
  }

  async dispose() {
    await this._ensureInitialized();
    await this._page.close();
    await this._browser.close();
    this._initialized = false;
  }
}

module.exports = Shooter;
