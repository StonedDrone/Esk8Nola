# Esk8 NOLA Ride Companion

The mobile-first companion for the Esk8 NOLA community and the playable **Esk8 Or Walk** experience at [esk8nola.org](https://esk8nola.org/).

## Included features

- Live GPS ride tracking: speed, distance, duration, and maximum speed
- Pre-ride board and safety checklist
- Community pothole warnings and safe-zone radar
- Fall detection workflow and emergency information
- Live rider presence, group rides, ride recaps, streaks, and kudos
- Rider profiles and community gear exchange
- Installable Progressive Web App (PWA)
- Direct launch into the Esk8 Or Walk game website

## Local development

Requirements: Node.js 20 or newer and a Firebase project.

1. Install dependencies with `npm install`.
2. Replace the example values in `firebase-applet-config.json` with the public web configuration from your Firebase project.
3. Review and deploy `firestore.rules` before enabling community data.
4. Run `npm run dev`.
5. Verify with `npm run lint` and `npm run build`.

## Important setup notes

Google sign-in must be enabled in Firebase Authentication. Add every production hostname to Firebase Authentication's authorized domains. GPS and motion sensors require HTTPS on phones. Emergency and fall-alert features are community aids, not substitutes for emergency services.

No private API key is bundled into the browser app. Firebase web configuration identifies the project but security is enforced by Authentication and Firestore rules.
