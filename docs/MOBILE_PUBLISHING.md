# Steel Currents - Mobile App Publishing Guide

## Overview

Steel Currents has been configured for native iOS and Android deployment using **Capacitor**, which wraps the web game as native applications for both platforms.

## Project Structure

```
steel-currents/
├── www/                          # Web assets for mobile apps
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── vendor/
│   └── shared/
├── ios/                          # iOS Xcode project
│   └── App/
├── android/                      # Android Studio project
│   └── app/
├── capacitor.config.json         # Capacitor configuration
└── docs/MOBILE_PUBLISHING.md    # This file
```

## Prerequisites

### For iOS Development
- macOS 12 or later
- Xcode 14+ (available on App Store)
- iOS Deployment Target: 13.0+
- Apple Developer Account ($99/year)
- At least 50GB free disk space

### For Android Development
- Android Studio (free)
- JDK 11+ 
- Android SDK API 34
- Google Play Developer Account ($25 one-time)
- At least 10GB free disk space

### General
- Node.js 16+
- Capacitor CLI (installed: `npm install -g @capacitor/cli`)

## Setup Instructions

### 1. Build Web Assets
```bash
npm run build
```
This copies all necessary web assets to the `www/` directory for the native builds.

### 2. iOS Setup

#### Initial Setup
```bash
npm run open:ios
```
This syncs assets and opens Xcode with the iOS project.

#### In Xcode
1. Select "Steel Currents" project in Project Navigator
2. Go to Signing & Capabilities
3. Add your Apple ID account
4. Select your team
5. Create a unique Bundle Identifier (e.g., `com.yourcompany.steelcurrents`)

#### Icon Setup
1. Create app icons using [AppIcon.co](https://www.appicon.co/)
   - 1024x1024 source image in PNG format
   - Follow Apple's guidelines (no alpha channel for final slot)
2. In Xcode: Select Assets.xcassets → AppIcon
3. Drag icons from the generated set into each slot
4. Verify in Xcode: Build → Clean → Build

#### Splash Screen
1. Design a 2732x2732px splash screen (PNG)
2. In Xcode: Select Assets.xcassets → LaunchScreen
3. Update Launch.storyboard with your branding

#### Device Testing
```bash
npm run open:ios
# In Xcode: Select your device, press Play
```

### 3. Android Setup

#### Initial Setup
```bash
npm run open:android
```
This syncs assets and opens Android Studio with the Android project.

#### Keystore Setup (Required for Publishing)
```bash
keytool -genkey -v -keystore ~/steel-currents-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias steelcurrents
```
**Save the password securely** — you'll need it for every release.

#### Icon Setup
1. Create icons using [AppIcon.co](https://www.appicon.co/) (select Android)
2. In Android Studio:
   - Right-click `app/res` → New → Image Asset
   - Select "App Icon" as Asset Type
   - Choose image and configure (adaptive icon recommended)
   - Android will auto-generate all required sizes

#### Device Testing
- Connect Android device via USB with Developer Mode enabled
- Android Studio will detect it automatically
- Click the Play button to build and run

## Building for Distribution

### iOS App Store Build

#### Step 1: Create an App Store Connect Entry
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click "My Apps" → "+"
3. Fill in app details:
   - Name: "Steel Currents"
   - Bundle ID: (match Xcode)
   - SKU: anything unique
   - Access Rights: Select appropriate
4. Click Create

#### Step 2: Archive in Xcode
```bash
npm run sync:ios
# Open Xcode
# Product → Scheme → Edit Scheme
# Set Build Configuration to "Release"
# Product → Archive
```

#### Step 3: Upload to App Store
- Window → Organizer
- Select the archive
- Validate App
- Upload to App Store

#### Step 4: App Store Review
1. Go to App Store Connect → TestFlight → Build Testing
2. Add beta testers (at least 1 required)
3. After beta testing, submit for App Store Review:
   - App Store Connect → Version Release
   - Fill in Screenshots, Description, etc.
   - Submit for Review
4. Apple reviews within 24-48 hours

### Android Google Play Build

#### Step 1: Create a Play Console Entry
1. Go to [Google Play Console](https://play.google.com/console)
2. Click "Create app"
3. Fill in app details:
   - Language: English
   - App or game: Game
   - Free or paid: Free (recommended for initial launch)
4. Click Create

#### Step 2: Complete Store Listing
- App details: name, description, category (Strategy)
- Graphics: icons, screenshots (5-8 recommended), promotional banner
- Content rating questionnaire
- Pricing & distribution

#### Step 3: Build Release APK/Bundle
```bash
npm run open:android
```

In Android Studio:
1. Build → Generate Signed Bundle / APK
2. Select "App Bundle" (recommended for Play Store)
3. Key store path: ~/steel-currents-release.jks
4. Key store password: (your password)
5. Key alias: steelcurrents
6. Key password: (your password)
7. Build type: Release
8. Finish

#### Step 4: Upload to Google Play
1. Play Console → Internal Testing → Releases
2. Create new release
3. Upload the signed AAB file
4. Review details
5. Submit for Review

#### Step 5: Google Play Review
- Usually completes within 3-24 hours
- Monitor status in Play Console
- Can set Release Date

## App Store Screenshots & Metadata

### Required for Both Stores

#### Screenshots (minimum 2, recommended 5)
Create at these resolutions:
- **iOS**: 1170×2532px (or provide multiple sizes)
- **Android**: 1080×1920px (or provide multiple sizes)

Screenshots should showcase:
1. Title screen with UI
2. Gameplay/battle scene
3. HUD/radar display
4. Victory/match results
5. Ship selection/loadout

#### Description (160-180 characters)
"Command a WW2 warship in intense PvP naval battles. Master ballistics, armor, and radar detection."

#### Full Description (1000+ characters)
```
Steel Currents - Experience tactical naval warfare in this immersive WW2 warship simulation.

GAMEPLAY:
- Command historically accurate warship classes from Fletcher destroyers to Iowa battleships
- Engage in real-time multiplayer PvP battles
- Master ballistic physics and armor penetration mechanics
- Coordinate with teammates in capture-the-point objectives

FEATURES:
- 5 unique warship classes with authentic capabilities
- Dynamic ocean rendering with real-time wave simulation
- Procedurally generated naval arenas
- Fog-of-war detection system with radar and visual spotting
- Damage control and crew management
- AI bot captains for single-player practice

COMBAT SYSTEMS:
- Shell ballistics with time-of-flight calculation
- Multi-zone armor modeling (bow, belt, deck, citadel)
- Torpedo and aircraft strike mechanics
- Realistic fire propagation and flooding

MULTIPLAYER:
- 2v2 to 4v4 player battles
- Dynamic weather and sea states
- Real-time voice coordination (optional)
- Persistent progression and achievements
```

#### Keywords
- naval combat
- WW2 simulation
- multiplayer tactics
- warships
- strategy game
- real-time combat
- historical simulation

#### Support Email
Create a support email for player inquiries.

#### Privacy Policy
Required for both stores. Template available in `docs/PRIVACY_POLICY.md`

## Version Management

Update these files for each release:

### capacitor.config.json
```json
{
  "appId": "com.steelcurrents.game",
  "appName": "Steel Currents",
  "webDir": "www",
  "version": "1.0.0"
}
```

### iOS (ios/App/App/Info.plist)
```xml
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>
<key>CFBundleVersion</key>
<string>1</string>
```

### Android (android/app/build.gradle)
```gradle
android {
    defaultConfig {
        versionCode 1
        versionName "1.0.0"
    }
}
```

## Testing Checklist Before Submission

- [ ] Game starts without crashes
- [ ] Server connection works (localhost or production)
- [ ] All three camera modes (chase, bridge, tactical) function
- [ ] HUD displays correctly on all screen sizes
- [ ] Touch controls respond properly
- [ ] Audio plays without distortion
- [ ] No console errors in DevTools
- [ ] Battery/data usage is reasonable
- [ ] No permissions requests unless necessary
- [ ] App closes cleanly without freezing

## Common Issues & Solutions

### Issue: "webDir is not a valid value"
**Solution**: Ensure www/ directory exists with index.html

### Issue: iOS build fails with "provisioning profile"
**Solution**: In Xcode, go to Signing & Capabilities and re-select your team

### Issue: Android build fails with keystore
**Solution**: Verify keystore path and passwords with:
```bash
keytool -list -v -keystore ~/steel-currents-release.jks
```

### Issue: Game doesn't connect to server on device
**Solution**: Update server URL in `client/js/net.js` to your deployed server (not localhost)

## Deployment

### Server Configuration for Production
Update `server/index.js` to use a public URL instead of localhost:8080

```javascript
const publicUrl = process.env.PUBLIC_URL || 'wss://game.steelcurrents.com';
```

### Recommended Hosting
- **Web Server**: AWS EC2, DigitalOcean, Heroku
- **WebSocket Server**: Same as above
- **CDN**: CloudFlare (for static assets)
- **SSL Certificate**: Let's Encrypt (free)

## Resources

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Google Play Console](https://play.google.com/console)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policies](https://play.google.com/about/developer-content-policy/)

## Support

For issues during development:
1. Check the [Capacitor Forums](https://forum.capacitorjs.com/)
2. Review app store rejection reasons
3. Test in development environment first
4. Use TestFlight (iOS) or Internal Testing (Android) for beta testing
