# Readaroo on your phone

There are three ways to put Readaroo on a phone, from 2 minutes to an App Store listing.

| Way | Time | Cost | Works offline | Who can get it |
| --- | --- | --- | --- | --- |
| 1. Install from the browser (web app) | 2 minutes | Free | Opens offline; borrowing needs the server | Anyone who can reach your server |
| 2. Native app on your own phone (Capacitor) | About 1 hour the first time | Free | Fully: the engine and demo data run on the phone | Your own devices |
| 3. App Store and Google Play | Days (store review) | Apple $99/year, Google $25 once | Fully | Everyone |

The phone apps in ways 2 and 3 run the **same app and engine** as the website, bundled with the synthetic demo data. No server is needed and nothing leaves the phone. Stripe charges are simulated there.

## 1. Install from the browser

Readaroo is an installable web app: it has an app icon, opens full screen, and the screens open even with no connection (a service worker keeps a copy of the app files).

1. On your computer: `npm run offline`, but open it to your Wi-Fi so the phone can reach it:
   ```bash
   READAROO_HOST=0.0.0.0 npm run offline
   ```
   Find your computer's address (Mac: **System Settings → Wi-Fi → Details → IP address**, for example `192.168.1.20`).
2. On the phone (same Wi-Fi), open `http://192.168.1.20:3000`.
3. Add it to the home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** tap **Install app** in Readaroo's header, or Chrome's menu → **Install app**.

Phones only allow full installs, including offline use, over **https** or on the same computer (`localhost`). Over plain `http://192.168…` the home-screen icon still works, but some browsers skip the offline copy. For a real https address, host it (for example on Render, Railway or Fly.io) and open that link on the phone.

## 2. Native app on your own phone (Capacitor)

[Capacitor](https://capacitorjs.com/docs) wraps the web app in a real iOS and Android app. The project is already set up: `capacitor.config.json` (app id `app.readaroo.demo`) and the build script.

### Android (Mac, Windows or Linux)

1. Install [Android Studio](https://developer.android.com/studio). Open it once so it downloads the Android SDK.
2. In the `readaroo` folder:
   ```bash
   npm ci
   npx cap add android        # first time only: creates the android/ folder
   npm run mobile:android     # builds mobile/www, syncs it, opens Android Studio
   ```
3. Plug in your phone with **USB debugging** on (Settings → About phone → tap Build number 7 times → Developer options → USB debugging), pick it at the top of Android Studio and press **Run ▶**.

### iPhone (Mac only)

1. Install **Xcode** from the Mac App Store and open it once. Install CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`).
2. In the `readaroo` folder:
   ```bash
   npm ci
   npx cap add ios            # first time only: creates the ios/ folder
   npm run mobile:ios         # builds mobile/www, syncs it, opens Xcode
   ```
3. In Xcode: select the **App** target → **Signing & Capabilities** → choose your Apple ID as the team (a free Apple ID works for your own phone). Plug in the iPhone, pick it at the top, press **Run ▶**. On the phone, approve the developer in **Settings → General → VPN & Device Management**.

A free Apple ID installs on up to 3 of your own devices, and the install has to be renewed from Xcode every 7 days ([Apple](https://developer.apple.com/support/compare-memberships)).

### App icon and splash screen

`resources/icon.png`, `resources/icon-foreground.png` and `resources/splash.png` are Roo, ready for Capacitor's asset tool:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#5B3FE0' --splashBackgroundColor '#F2F7FF'
```

### After you change the app

Edit files in `public/` or `src/` as usual, then rerun `npm run mobile:android` or `npm run mobile:ios`. That rebuilds `mobile/www/index.html` and copies it into the native projects.

## 3. App Store and Google Play

| Store | Account | What it costs | Notes |
| --- | --- | --- | --- |
| Apple App Store | [Apple Developer Program](https://developer.apple.com/help/account/membership/program-enrollment/) | 99 USD a year | Upload from Xcode (Product → Archive), test with TestFlight, then submit for review |
| Google Play | [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en-GB) | 25 USD once | New personal accounts must finish Google's app-testing requirements before publishing |

**Kids' apps have extra rules.** Apps in Apple's Kids category, or made for kids, can't include third-party advertising or analytics, and can't send data to third parties (Guidelines 1.3 and 5.1.4, [Apple](https://developer.apple.com/news/?id=06032019j)). Readaroo has no ads or analytics. Before a real launch you'd still need a privacy policy, a parental gate in front of anything that leaves the app (such as links to bookstores), and a review of COPPA in the US.

**What has to change before a real store release:**

- Real accounts and sign-in (today "Acting as" is a demo switcher).
- Connect the phone app to a hosted Readaroo server instead of the bundled demo data, so borrows and Stripe charges are real (test mode first).
- Real library catalogs and events instead of synthetic ones.
- Set `readingSecondsPerMinute` to 60 so the reader counts real minutes.
- Bundle the fonts inside the app. Today they load from Google Fonts, which is a request to a third party.

## What was tested

- The web app passes Chrome's install check (Chrome offered "Install app"), registers its service worker, and serves its manifest and icons. `npm test` checks these files.
- `npx cap add android` with Capacitor 6.2.3 generated the Android project with Readaroo inside. Building the APK itself needs Android Studio, which wasn't available where this was built.
- The iOS project was not generated here (it needs a Mac with Xcode).
